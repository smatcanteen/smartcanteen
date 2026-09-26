/** Shared operator helpers — digests, insights, stock flags, plan price, term card. */

import type { Debtor, State, StockItem, Tx } from "./store";
import { parseAmount, parseExpense, parseStock } from "./voice";

/** Live plan: one prepay of UGX 35,000 covers four months. */
export const PLAN_PRICE_UGX = 35_000;
export const PLAN_MONTHS = 4;
export const PLAN_LABEL = "UGX 35,000 for 4 months";
export const SUPPORT_WHATSAPP = "256758727269";

const money = (n: number) => new Intl.NumberFormat("en-UG").format(Math.round(n));
const dayMs = 86_400_000;

export const dayKeyOf = (ts = Date.now()) => {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const paidSoFar = (d: Debtor) => (d.payments ?? []).reduce((a, p) => a + p.amount, 0);
export const balanceOf = (d: Debtor) => Math.max(0, d.amount - paidSoFar(d));
export const ageDays = (d: Debtor) => Math.floor((Date.now() - d.ts) / dayMs);

/** Shelf quantity — physical check wins when present. */
export function shelfQty(item: StockItem): number {
  return item.lastKnownQuantity != null ? item.lastKnownQuantity : item.stock;
}

/** Flag running low at ≤10% of term qty, or ≤5 units. */
export function shouldFlagLow(item: StockItem): boolean {
  const left = shelfQty(item);
  if (left <= 0) return true;
  const threshold = Math.max(5, Math.ceil(item.qty * 0.1));
  return left <= threshold;
}

export function lowStockItems(items: StockItem[]): StockItem[] {
  return items.filter((i) => i.runningLow || shouldFlagLow(i));
}

export function overdueDebtors(debtors: Debtor[], minDays = 7): Debtor[] {
  return debtors.filter((d) => balanceOf(d) > 0 && ageDays(d) >= minDays);
}

/** Plain-language home nudges from this operator's own numbers. */
export function buildInsights(state: State, termProfit: number): string[] {
  const tips: string[] = [];
  const now = Date.now();
  const weekAgo = now - 7 * dayMs;
  const twoWeeks = now - 14 * dayMs;

  const sumCat = (from: number, to: number, cat: string) =>
    state.txs
      .filter((t) => t.type === "expense" && t.category === cat && t.ts >= from && t.ts < to)
      .reduce((a, t) => a + t.amount, 0);

  const transportThis = sumCat(weekAgo, now, "Transport");
  const transportPrev = sumCat(twoWeeks, weekAgo, "Transport");
  if (transportPrev > 0 && transportThis > transportPrev * 1.25) {
    const pct = Math.round(((transportThis - transportPrev) / transportPrev) * 100);
    tips.push(`Transport is up ${pct}% vs last week (UGX ${money(transportThis)} this week).`);
  }

  const salesThis = state.txs
    .filter((t) => t.type === "sale" && t.ts >= weekAgo)
    .reduce((a, t) => a + t.amount, 0);
  const salesPrev = state.txs
    .filter((t) => t.type === "sale" && t.ts >= twoWeeks && t.ts < weekAgo)
    .reduce((a, t) => a + t.amount, 0);
  if (salesPrev > 0 && salesThis < salesPrev * 0.75) {
    tips.push(`Sales are down vs last week — UGX ${money(salesThis)} this week vs UGX ${money(salesPrev)} before.`);
  } else if (salesPrev > 0 && salesThis > salesPrev * 1.25) {
    tips.push(`Strong week — sales up vs last week (UGX ${money(salesThis)}).`);
  }

  const low = lowStockItems(state.items);
  if (low.length) {
    tips.push(
      low.length === 1
        ? `${low[0]!.name} is running low (${shelfQty(low[0]!)} left) — restock soon.`
        : `${low.length} items running low: ${low
            .slice(0, 3)
            .map((i) => i.name)
            .join(", ")}${low.length > 3 ? "…" : ""}.`,
    );
  }

  const overdue = overdueDebtors(state.debtors, 7);
  if (overdue.length) {
    const total = overdue.reduce((a, d) => a + balanceOf(d), 0);
    tips.push(
      `${overdue.length} credit${overdue.length > 1 ? "s" : ""} unpaid 7+ days — UGX ${money(total)} still out.`,
    );
  }

  if (state.savingsGoal > 0) {
    const pct = Math.max(0, Math.min(100, Math.round((termProfit / state.savingsGoal) * 100)));
    if (pct >= 100) tips.push(`Term savings goal reached — UGX ${money(termProfit)} net so far.`);
    else if (pct >= 75) tips.push(`Almost there — ${pct}% of your UGX ${money(state.savingsGoal)} term goal.`);
  }

  const due = (state.recurringExpenses ?? []).filter((r) => r.nextDue <= now);
  for (const r of due.slice(0, 2)) {
    tips.push(`${r.category} of UGX ${money(r.amount)} is due — open Expenses to log it.`);
  }

  return tips.slice(0, 4);
}

export function buildDayDigest(opts: {
  termName: string;
  sales: number;
  expenses: number;
  net: number;
  expected: number;
  counted: number;
  diff: number;
  dayKey: string;
}) {
  const bal =
    opts.diff === 0
      ? "Till balanced"
      : opts.diff > 0
        ? `Surplus UGX ${money(opts.diff)}`
        : `Shortfall UGX ${money(Math.abs(opts.diff))}`;
  return [
    `SmartCanteen · ${opts.termName}`,
    `Day close ${opts.dayKey}`,
    "",
    `Sales: UGX ${money(opts.sales)}`,
    `Out (stock + expenses): UGX ${money(opts.expenses)}`,
    `Net: UGX ${money(opts.net)}`,
    `App cash: UGX ${money(opts.expected)}`,
    `Counted: UGX ${money(opts.counted)}`,
    bal,
    "",
    "— sent from SmartCanteen",
  ].join("\n");
}

/** Open WhatsApp with a pre-filled message. Empty phone → share picker via wa.me. */
export function openWhatsApp(message: string, phone?: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  const msisdn = digits
    ? digits.startsWith("0")
      ? `256${digits.slice(1)}`
      : digits.length === 9
        ? `256${digits}`
        : digits
    : "";
  const url = msisdn
    ? `https://wa.me/${msisdn}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
  if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
  return url;
}

export function renewalReminderMessage(opts: {
  termName: string;
  dueLabel: string;
  school?: string;
}) {
  return [
    `SmartCanteen renewal reminder`,
    opts.school ? `Canteen: ${opts.school}` : opts.termName,
    "",
    `Plan: ${PLAN_LABEL}`,
    `Access through: ${opts.dueLabel}`,
    "",
    `Pay UGX ${money(PLAN_PRICE_UGX)} to +256 758 727269 or +256 783 113352`,
    `Use your canteen name as the MoMo reference.`,
    "",
    "After paying, forward the confirmation so access stays open.",
  ].join("\n");
}

export function referralCodeFrom(userId: string | null | undefined, existing?: string | null) {
  if (existing && existing.length >= 4) return existing.toUpperCase();
  const raw = (userId ?? "guest").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const tail = raw.slice(-4) || "SC01";
  return `SC${tail}`;
}

export function referralShareMessage(code: string) {
  return [
    "I'm using SmartCanteen for my canteen cash book.",
    `Join with my code ${code} and we both get a free month when you subscribe.`,
    "Open: https://smatcanteen.lovable.app/login",
    `Plan: ${PLAN_LABEL}`,
  ].join("\n");
}

/** One-page shareable term report card (print → Save as PDF). */
export function exportTermReportCard(opts: {
  termName: string;
  school?: string;
  sales: number;
  stock: number;
  expenses: number;
  net: number;
  expectedProfit: number;
  outstanding: number;
  cashAtHand: number;
  goal: number;
  startedAt: number;
}) {
  const win = window.open("", "_blank", "width=720,height=960");
  if (!win) return;
  const net = opts.net;
  const goalPct =
    opts.goal > 0 ? Math.max(0, Math.min(100, Math.round((net / opts.goal) * 100))) : 0;
  const started = new Date(opts.startedAt).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const esc = (s: string) =>
    String(s ?? "")
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/"/g, "&quot;");
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Term report — ${esc(opts.termName)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a2e22; margin: 0; }
    .card { border: 2px solid #2f6b46; border-radius: 16px; padding: 28px; max-width: 640px; margin: 0 auto; }
    h1 { margin: 0 0 4px; color: #2f6b46; font-size: 22px; }
    .sub { color: #6b736c; font-size: 13px; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .box { background: #f4f7f4; border-radius: 10px; padding: 14px; }
    .box span { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #6b736c; }
    .box strong { font-size: 20px; color: #1a2e22; }
    .box.accent strong { color: #2f6b46; }
    .goal { margin-top: 16px; }
    .bar { height: 10px; background: #dde5dd; border-radius: 999px; overflow: hidden; }
    .bar i { display: block; height: 100%; background: #2f6b46; width: ${goalPct}%; }
    footer { margin-top: 22px; font-size: 11px; color: #8a918a; text-align: center; }
  </style></head><body>
  <div class="card">
    <h1>Term report card</h1>
    <div class="sub">${esc(opts.school || "SmartCanteen")} · ${esc(opts.termName)} · from ${started}</div>
    <div class="grid">
      <div class="box accent"><span>Total sales</span><strong>UGX ${money(opts.sales)}</strong></div>
      <div class="box"><span>Stock + expenses</span><strong>UGX ${money(opts.stock + opts.expenses)}</strong></div>
      <div class="box accent"><span>Net profit</span><strong>UGX ${money(net)}</strong></div>
      <div class="box"><span>Expected profit (stock)</span><strong>UGX ${money(opts.expectedProfit)}</strong></div>
      <div class="box"><span>Outstanding credit</span><strong>UGX ${money(opts.outstanding)}</strong></div>
      <div class="box accent"><span>Cash at Hand</span><strong>UGX ${money(opts.cashAtHand)}</strong></div>
    </div>
    ${
      opts.goal > 0
        ? `<div class="goal"><div class="sub">Savings goal ${goalPct}% of UGX ${money(opts.goal)}</div><div class="bar"><i></i></div></div>`
        : ""
    }
    <footer>SmartCanteen · generated ${new Date().toLocaleString("en-GB")} · Save as PDF from the print dialog</footer>
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script>
  </body></html>`);
  win.document.close();
}

/** Split spoken text into one or more draft entries for the confirm screen. */
export type VoiceDraft =
  | { kind: "sale"; amount: number; raw: string }
  | { kind: "expense"; amount: number; category?: string; raw: string }
  | { kind: "stock"; name: string; qty: number; buy: number; sell: number; raw: string };

export function parseVoiceDrafts(
  text: string,
  categories: { label: string }[],
  knownItems: { name: string }[],
): VoiceDraft[] {
  const chunks = text
    .split(/\b(?:and then|then|also|plus)\b/i)
    .map((c) => c.trim())
    .filter(Boolean);
  const out: VoiceDraft[] = [];
  for (const chunk of chunks.length ? chunks : [text]) {
    const lower = chunk.toLowerCase();
    const isExpense =
      /\b(transport|salary|wage|allowance|rent|expense|spent|paid|airtime|data|gas|water)\b/i.test(
        lower,
      );
    const isStock = /\b(stock|bought|restock|crate|pieces?|packet)\b/i.test(lower);
    if (isStock) {
      const s = parseStock(chunk, knownItems);
      if (s.qty > 0 || s.buy > 0) {
        out.push({ kind: "stock", name: s.name || "Item", qty: s.qty, buy: s.buy, sell: s.sell, raw: chunk });
        continue;
      }
    }
    if (isExpense) {
      const e = parseExpense(chunk, categories);
      if (e.amount > 0) {
        out.push({ kind: "expense", amount: e.amount, category: e.category, raw: chunk });
        continue;
      }
    }
    const amount = parseAmount(chunk);
    if (amount > 0) out.push({ kind: "sale", amount, raw: chunk });
  }
  return out;
}

export function txsToday(txs: Tx[]): Tx[] {
  const key = dayKeyOf();
  return txs.filter((t) => dayKeyOf(t.ts) === key);
}

/** Shift a dayKey (YYYY-MM-DD) by N calendar days. */
export function shiftDayKey(dayKey: string, deltaDays: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d!);
  dt.setDate(dt.getDate() + deltaDays);
  return dayKeyOf(dt.getTime());
}

export function yesterdayKey(now = Date.now()): string {
  return shiftDayKey(dayKeyOf(now), -1);
}

export type DayCloseLike = { dayKey: string; ts: number; net: number; sales: number; expenses: number; diff: number };

export function closeForDay(closes: DayCloseLike[] | undefined, dayKey: string): DayCloseLike | undefined {
  return (closes ?? []).find((c) => c.dayKey === dayKey);
}

/** Consecutive closed days ending at today if closed, else yesterday. */
export function closeStreak(closes: DayCloseLike[] | undefined, now = Date.now()): number {
  const list = closes ?? [];
  if (!list.length) return 0;
  const keys = new Set(list.map((c) => c.dayKey));
  let cursor = dayKeyOf(now);
  // Streak counts back from today if closed, otherwise from yesterday.
  if (!keys.has(cursor)) cursor = yesterdayKey(now);
  if (!keys.has(cursor)) return 0;
  let n = 0;
  while (keys.has(cursor)) {
    n += 1;
    cursor = shiftDayKey(cursor, -1);
  }
  return n;
}

export function dayTotals(txs: Tx[], dayKey: string): { sales: number; expenses: number; net: number; count: number } {
  let sales = 0;
  let expenses = 0;
  let count = 0;
  for (const t of txs) {
    if (dayKeyOf(t.ts) !== dayKey) continue;
    count += 1;
    if (t.type === "sale") sales += t.amount;
    else if (t.type === "expense" || t.type === "stock") expenses += t.amount;
  }
  return { sales, expenses, net: sales - expenses, count };
}

/** Hour 0–23 in local time. */
export function localHour(now = Date.now()): number {
  return new Date(now).getHours();
}

/** True once local time is 18:00 or later and today is not closed. */
export function needsEveningClose(closes: DayCloseLike[] | undefined, now = Date.now()): boolean {
  if (localHour(now) < 18) return false;
  return !closeForDay(closes, dayKeyOf(now));
}

export function eveningCloseMessage(opts: { termName: string; sales: number; net: number }) {
  return [
    `SmartCanteen · ${opts.termName}`,
    "Time to close the day 🔔",
    "",
    `Today so far: sales UGX ${money(opts.sales)}, net UGX ${money(opts.net)}.`,
    "Open the app → Close Day → count the till (about 2 minutes).",
    "",
    "Keep the streak going.",
  ].join("\n");
}

export function morningGreeting(hour = localHour()): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
