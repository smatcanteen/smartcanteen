import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { listAccountProgress } from "@/lib/accounts.functions";
import { Icon } from "@/components/Icon";
import { Card, SectionTitle } from "@/components/ui-kit";
import { Kpi, Pill, can, statusTone } from "@/components/AdminShell";
import { useAuth } from "@/lib/auth";
import { whatsappLink } from "@/lib/invite";
import {
  arrFromMrr,
  atRiskQueue,
  cashInMonth,
  mergeProgress,
  monthlyChurnPct,
  mrrFromActive,
  usageThisWeek,
  withHealth,
  zoneBenchmarks,
  type ProgressRow,
} from "@/lib/admin-metrics";
import { fmtDate, statusLabels, ugxDisplay, usePlatform } from "@/lib/platform";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard — SmartCanteen" },
      {
        name: "description",
        content: "MRR, churn, at-risk schools, usage and renewals for SmartCanteen.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const { s, markRenewalChase, logAction } = usePlatform();
  const [progress, setProgress] = useState<Record<string, ProgressRow>>({});

  useEffect(() => {
    let alive = true;
    void listAccountProgress()
      .then((res) => {
        if (!alive || !res.ok) return;
        setProgress(Object.fromEntries(res.rows.map((row) => [row.accountId, row])));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const liveTenants = useMemo(
    () => withHealth(s.tenants.map((t) => mergeProgress(t, progress[t.accountId]))),
    [s.tenants, progress],
  );

  const active = liveTenants.filter((x) => x.status === "active");
  const trial = liveTenants.filter((x) => x.status === "trial");
  const pastDue = liveTenants.filter((x) => x.status === "past_due");
  const mrr = mrrFromActive(active.length, s.settings);
  const arr = arrFromMrr(mrr);
  const churn = monthlyChurnPct(liveTenants);
  const paidMonth = cashInMonth(s.payments ?? []);
  const cashIn = paidMonth.reduce((a, p) => a + p.amount, 0);
  const pendingClaims = (s.paymentClaims ?? []).filter((c) => c.status === "pending").length;
  const usage = usageThisWeek(liveTenants);
  const risk = atRiskQueue(liveTenants);
  const zones = zoneBenchmarks(liveTenants);

  const chaseMsg = (name: string, school: string) =>
    `Hello ${name}, this is SmartCanteen. Your canteen access for ${school || "your school"} is due for renewal soon. Pay UGX ${ugxDisplay(s.settings.priceUGX)} for ${s.settings.months} months to either +256 758 727269 or +256 783 113352, then send us the confirmation. Thank you.`;

  const chaseTier = (nextBillingAt: number): 14 | 7 | 1 | null => {
    const days = Math.ceil((nextBillingAt - Date.now()) / 86_400_000);
    if (days <= 1 && days >= 0) return 1;
    if (days <= 7) return 7;
    if (days <= 14) return 14;
    return null;
  };

  const alreadyChased = (accountId: string, tier: 14 | 7 | 1) =>
    (s.renewalChases ?? []).some(
      (c) => c.accountId === accountId && c.tier === tier && Date.now() - c.ts < 5 * 86_400_000,
    );

  const renewals = liveTenants
    .filter(
      (x) =>
        x.nextBillingAt > Date.now() &&
        x.nextBillingAt <= Date.now() + 14 * 86_400_000 &&
        x.status !== "churned" &&
        x.status !== "suspended",
    )
    .sort((a, b) => a.nextBillingAt - b.nextBillingAt);

  const sendChase = (r: (typeof renewals)[0], openWa: boolean) => {
    const tier = chaseTier(r.nextBillingAt);
    if (!tier) return;
    markRenewalChase({ accountId: r.accountId, tier, who: user?.name ?? "admin" });
    if (openWa) {
      const href = whatsappLink(r.phone, chaseMsg(r.ownerName || r.canteenName, r.school));
      if (href) window.open(href, "_blank");
    }
  };

  const healthTone = (h: string) =>
    h === "healthy" ? "good" : h === "watch" ? "warn" : h === "at_risk" ? "warn" : "bad";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Portfolio overview</p>
          <h1 className="text-2xl font-extrabold text-on-surface sm:text-3xl">Admin dashboard</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Recurring revenue, churn, schools at risk and who used the app this week.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/admin/insights"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-primary px-4 text-sm font-bold text-primary"
          >
            <Icon name="insights" className="text-[18px]" /> Insights
          </Link>
          <Link
            to="/admin/accounts"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-outline-variant px-4 text-sm font-bold text-on-surface"
          >
            <Icon name="storefront" className="text-[18px]" /> Accounts
          </Link>
          {can(user?.role, "new") ? (
            <Link
              to="/admin/new"
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-on-primary shadow-sm"
            >
              <Icon name="person_add" className="text-[18px]" /> New account
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-sm md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Active" value={String(active.length)} sub={`${trial.length} on trial`} icon="verified" />
        {can(user?.role, "revenue") ? (
          <Kpi
            label="MRR (run-rate)"
            value={`UGX ${ugxDisplay(mrr)}`}
            sub={`ARR ~ UGX ${ugxDisplay(arr)} · active ÷ ${s.settings.months} mo`}
            icon="trending_up"
          />
        ) : null}
        {can(user?.role, "revenue") ? (
          <Kpi
            label="Cash in this month"
            value={`UGX ${ugxDisplay(cashIn)}`}
            sub={`${paidMonth.length} payments · ${pendingClaims} claims`}
            icon="payments"
          />
        ) : null}
        <Kpi
          label="Churn this month"
          value={`${churn.pct}%`}
          sub={`${churn.lost} school${churn.lost === 1 ? "" : "s"} left`}
          icon="trending_down"
        />
        <Kpi
          label="Used app this week"
          value={String(usage.count)}
          sub={`of ${liveTenants.length} schools`}
          icon="touch_app"
        />
        <Kpi label="At risk" value={String(risk.length)} sub={`${pastDue.length} expired`} icon="warning" />
      </div>

      <div className="grid min-w-0 gap-md lg:grid-cols-2">
        <Card className="min-w-0 space-y-sm">
          <SectionTitle>At-risk / health queue</SectionTitle>
          <p className="text-xs text-on-surface-variant">
            Health blends last login, setup steps, entries and days to renew.
          </p>
          {risk.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No schools look at risk right now.</p>
          ) : (
            risk.slice(0, 12).map((r) => (
              <div
                key={r.accountId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-lowest p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-on-surface">{r.canteenName}</p>
                  <p className="text-xs text-on-surface-variant">
                    {r.school || "—"} · score {r.health}
                    {r.riskReasons[0] ? ` · ${r.riskReasons[0]}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Pill tone={healthTone(r.healthLabel) as "good" | "warn" | "bad"}>{r.healthLabel.replace("_", " ")}</Pill>
                  <Link
                    to="/admin/view/$accountId"
                    params={{ accountId: r.accountId }}
                    className="text-xs font-bold text-primary underline"
                  >
                    View as
                  </Link>
                  <Link to="/admin/accounts" className="text-xs font-bold text-on-surface-variant underline">
                    Manage
                  </Link>
                </div>
              </div>
            ))
          )}
        </Card>

        <Card className="min-w-0 space-y-sm">
          <SectionTitle>Used the app this week</SectionTitle>
          {usage.count === 0 ? (
            <p className="text-sm text-on-surface-variant">No logins in the last 7 days.</p>
          ) : (
            usage.rows.slice(0, 12).map((r) => (
              <div key={r.accountId} className="flex items-center justify-between gap-2 rounded-md bg-surface-lowest p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-on-surface">{r.canteenName}</p>
                  <p className="text-xs text-on-surface-variant">
                    {r.entries} entries · last {r.lastLoginAt ? fmtDate(r.lastLoginAt) : "—"}
                  </p>
                </div>
                <Pill tone={statusTone(r.status)}>{statusLabels[r.status]}</Pill>
              </div>
            ))
          )}
        </Card>
      </div>

      <div className="grid min-w-0 gap-md lg:grid-cols-2">
        <Card className="min-w-0 space-y-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionTitle>Renewals · 14 / 7 / 1 day chase</SectionTitle>
            {renewals.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  renewals.forEach((r, i) => {
                    const tier = chaseTier(r.nextBillingAt);
                    if (!tier || alreadyChased(r.accountId, tier)) return;
                    window.setTimeout(() => sendChase(r, true), i * 450);
                  });
                  logAction(user?.name ?? "admin", `Bulk renewal chase · ${renewals.length} schools`);
                }}
                className="min-h-9 rounded-full border border-primary px-3 text-xs font-bold text-primary"
              >
                WhatsApp all + log
              </button>
            ) : null}
          </div>
          {renewals.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Nothing due in the next two weeks.</p>
          ) : (
            renewals.map((r) => {
              const tier = chaseTier(r.nextBillingAt);
              const chased = tier ? alreadyChased(r.accountId, tier) : false;
              const href = whatsappLink(r.phone, chaseMsg(r.ownerName || r.canteenName, r.school));
              return (
                <div
                  key={r.accountId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-lowest p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-on-surface">{r.canteenName}</p>
                    <p className="text-xs text-on-surface-variant">
                      Due {fmtDate(r.nextBillingAt)}
                      {tier ? ` · ${tier}-day touch` : ""}
                      {chased ? " · chased" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {href ? (
                      <button
                        type="button"
                        onClick={() => sendChase(r, true)}
                        className="text-xs font-bold text-primary underline"
                      >
                        WhatsApp
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
          {(s.renewalChases ?? []).length > 0 ? (
            <div className="border-t border-outline-variant pt-2">
              <p className="mb-1 text-[11px] font-bold uppercase text-on-surface-variant">Recent chase log</p>
              {(s.renewalChases ?? []).slice(0, 6).map((c) => {
                const t = liveTenants.find((x) => x.accountId === c.accountId);
                return (
                  <p key={c.id} className="text-xs text-on-surface-variant">
                    {fmtDate(c.ts)} · {c.tier}d · {t?.canteenName ?? c.accountId} · {c.who}
                  </p>
                );
              })}
            </div>
          ) : null}
        </Card>

        <Card className="min-w-0 space-y-sm">
          <SectionTitle>Zone snapshot</SectionTitle>
          {zones.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No schools yet.</p>
          ) : (
            zones.map((z) => (
              <div key={z.zone} className="flex items-center justify-between gap-2 rounded-md bg-surface-lowest p-3">
                <div>
                  <p className="text-sm font-bold text-on-surface">{z.zone}</p>
                  <p className="text-xs text-on-surface-variant">
                    {z.active} active / {z.schools} schools · avg {z.avgEntries} entries
                  </p>
                </div>
              </div>
            ))
          )}
          <Link to="/admin/insights" className="text-xs font-bold text-primary underline">
            Full insights & export →
          </Link>
        </Card>
      </div>
    </>
  );
}
