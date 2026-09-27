/** Shared portfolio maths for the admin dashboard and health queues. */
import type { PaymentRecord, PlatformSettings, Tenant } from "./platform";
import { effectiveTenantStatus } from "./platform";

const DAY = 86_400_000;

export type ProgressRow = {
  accountId: string;
  entries: number;
  lastLoginAt: number | null;
  checklist: { loggedIn: boolean; capitalSet: boolean; firstStock: boolean; firstSale: boolean };
};

export type LiveTenant = Tenant & {
  health: number;
  healthLabel: "healthy" | "watch" | "at_risk" | "critical";
  riskReasons: string[];
};

export function mergeProgress(t: Tenant, p?: ProgressRow): Tenant {
  if (!p) return t;
  return {
    ...t,
    entries: p.entries,
    lastLoginAt: p.lastLoginAt,
    checklist: p.checklist,
  };
}

/** 0–100 score from login freshness, setup, activity and billing proximity. */
export function healthScore(t: Tenant, now = Date.now()): { score: number; reasons: string[] } {
  const status = effectiveTenantStatus(t, now);
  let score = 50;
  const reasons: string[] = [];

  if (status === "churned" || status === "suspended") {
    return { score: 5, reasons: [status === "churned" ? "Deactivated" : "Login suspended"] };
  }
  if (status === "past_due") {
    score -= 35;
    reasons.push("Access expired");
  }

  const loginAt = t.lastLoginAt;
  if (!loginAt) {
    score -= 25;
    reasons.push("Never logged in");
  } else {
    const days = (now - loginAt) / DAY;
    if (days <= 2) score += 20;
    else if (days <= 7) score += 10;
    else if (days <= 14) {
      score -= 5;
      reasons.push("No login in 2 weeks");
    } else {
      score -= 20;
      reasons.push(`No login ${Math.floor(days)} days`);
    }
  }

  const steps = Object.values(t.checklist).filter(Boolean).length;
  score += steps * 5;
  if (steps < 2) reasons.push("Setup incomplete");
  if (t.entries === 0 && status !== "trial") {
    score -= 15;
    reasons.push("No cash-book entries");
  } else if (t.entries >= 10) score += 10;
  else if (t.entries >= 3) score += 5;

  const daysToBill = (t.nextBillingAt - now) / DAY;
  if (status === "active" || status === "trial") {
    if (daysToBill <= 0) {
      score -= 20;
      reasons.push("Renewal overdue");
    } else if (daysToBill <= 7) {
      score -= 10;
      reasons.push("Renews within 7 days");
    } else if (daysToBill <= 14) {
      score -= 5;
      reasons.push("Renews within 14 days");
    }
  }

  if (t.tags.includes("stalled")) {
    score -= 10;
    reasons.push("Tagged stalled");
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}

export function healthLabel(score: number): LiveTenant["healthLabel"] {
  if (score >= 70) return "healthy";
  if (score >= 50) return "watch";
  if (score >= 30) return "at_risk";
  return "critical";
}

export function withHealth(tenants: Tenant[], now = Date.now()): LiveTenant[] {
  return tenants.map((t) => {
    const { score, reasons } = healthScore(t, now);
    return { ...t, health: score, healthLabel: healthLabel(score), riskReasons: reasons };
  });
}

/** Monthly recurring run-rate from active paid accounts (full plan / months). */
export function mrrFromActive(activeCount: number, settings: PlatformSettings) {
  const months = Math.max(1, settings.months || 4);
  return Math.round((activeCount * settings.priceUGX) / months);
}

export function arrFromMrr(mrr: number) {
  return mrr * 12;
}

/** Simple logo churn: deactivated this month / active at start of month (approx). */
export function monthlyChurnPct(tenants: Tenant[], now = Date.now()) {
  const start = new Date(now);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const startTs = start.getTime();
  const lost = tenants.filter(
    (t) => t.status === "churned" && t.nextBillingAt >= startTs && t.nextBillingAt <= now,
  ).length;
  const stillActive = tenants.filter((t) => t.status === "active").length;
  const base = stillActive + lost;
  if (base === 0) return { lost, pct: 0, base };
  return { lost, pct: Math.round((lost / base) * 1000) / 10, base };
}

export function usageThisWeek(tenants: Tenant[], now = Date.now()) {
  const weekAgo = now - 7 * DAY;
  const active = tenants.filter((t) => t.lastLoginAt && t.lastLoginAt >= weekAgo);
  return {
    count: active.length,
    rows: active.sort((a, b) => (b.lastLoginAt ?? 0) - (a.lastLoginAt ?? 0)),
  };
}

export function atRiskQueue(live: LiveTenant[], now = Date.now()) {
  return live
    .filter((t) => {
      const st = effectiveTenantStatus(t, now);
      if (st === "churned") return false;
      return (
        t.healthLabel === "at_risk" ||
        t.healthLabel === "critical" ||
        st === "past_due" ||
        t.tags.includes("stalled") ||
        (t.nextBillingAt - now <= 7 * DAY && t.nextBillingAt > now && (st === "active" || st === "trial"))
      );
    })
    .sort((a, b) => a.health - b.health);
}

/** Prorate full plan price for fewer months (min 1). */
export function prorateAmount(fullPrice: number, fullMonths: number, months: number) {
  const fm = Math.max(1, fullMonths || 4);
  const m = Math.max(1, Math.min(fm, Math.round(months)));
  return Math.round((fullPrice * m) / fm);
}

export function zoneBenchmarks(
  tenants: Tenant[],
  /** Optional map accountId → average daily sales (UGX) when known. */
  dailySalesByAccount: Record<string, number> = {},
) {
  const byZone = new Map<string, { schools: number; active: number; entries: number; salesSum: number; salesN: number }>();
  tenants.forEach((t) => {
    const z = t.zone || "Unknown";
    const row = byZone.get(z) ?? { schools: 0, active: 0, entries: 0, salesSum: 0, salesN: 0 };
    row.schools += 1;
    if (t.status === "active") row.active += 1;
    row.entries += t.entries || 0;
    const sales = dailySalesByAccount[t.accountId];
    if (typeof sales === "number" && sales > 0) {
      row.salesSum += sales;
      row.salesN += 1;
    }
    byZone.set(z, row);
  });
  return [...byZone.entries()]
    .map(([zone, r]) => ({
      zone,
      schools: r.schools,
      active: r.active,
      avgEntries: r.schools ? Math.round(r.entries / r.schools) : 0,
      avgDailySales: r.salesN ? Math.round(r.salesSum / r.salesN) : null,
    }))
    .sort((a, b) => b.active - a.active || b.schools - a.schools);
}

export function cashInMonth(payments: PaymentRecord[], now = Date.now()) {
  return payments.filter((p) => {
    const d = new Date(p.ts);
    const n = new Date(now);
    return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
  });
}
