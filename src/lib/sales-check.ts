/**
 * Sales check: splits sales into cash vs credit paid back, totals by day,
 * and flags entries that may have been saved twice. Flags only — never edits.
 */
export type SaleLike = { id: string; type: string; label: string; amount: number; ts: number };

export type DayRow = { day: string; ts: number; total: number; count: number };
export type Flag = {
  id: string;
  label: string;
  amount: number;
  ts: number;
  reason: string;
  /** Group key so twins show together. */
  group: string;
};

const MIN = 60_000;
/** Same-day repeats only count when the amount is big enough not to be a normal price. */
const BIG_REPEAT = 20_000;

export const isCreditPaid = (t: SaleLike) => /^credit paid/i.test(t.label);

export function dayKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function checkSales(txs: SaleLike[]) {
  const sales = txs.filter((t) => t.type === "sale").sort((a, b) => a.ts - b.ts);
  const cash = sales.filter((t) => !isCreditPaid(t));
  const credit = sales.filter(isCreditPaid);
  const sum = (rows: SaleLike[]) => rows.reduce((a, t) => a + t.amount, 0);

  const map = new Map<string, DayRow>();
  sales.forEach((t) => {
    const k = dayKey(t.ts);
    const row = map.get(k) ?? { day: k, ts: t.ts, total: 0, count: 0 };
    row.total += t.amount;
    row.count += 1;
    map.set(k, row);
  });
  const days = [...map.values()];
  const avg = days.length ? days.reduce((a, d) => a + d.total, 0) / days.length : 0;

  const flags = new Map<string, Flag>();
  const add = (t: SaleLike, reason: string, group: string) => {
    if (!flags.has(t.id)) flags.set(t.id, { id: t.id, label: t.label, amount: t.amount, ts: t.ts, reason, group });
  };
  // Cash sales only — a credit paid back is a different event.
  for (let i = 0; i < cash.length; i++) {
    for (let j = i + 1; j < cash.length; j++) {
      const a = cash[i]!;
      const b = cash[j]!;
      if (b.ts - a.ts > 60 * MIN * 24) break;
      if (a.amount !== b.amount) continue;
      const gap = b.ts - a.ts;
      const sameDay = dayKey(a.ts) === dayKey(b.ts);
      const group = `${dayKey(a.ts)}-${a.amount}`;
      if (gap <= 10 * MIN && a.label === b.label) {
        const why = `Same amount saved twice within ${Math.max(1, Math.round(gap / MIN))} min`;
        add(a, why, group);
        add(b, why, group);
      } else if (sameDay && a.amount >= BIG_REPEAT) {
        const why = "Same large amount twice on the same day";
        add(a, why, group);
        add(b, why, group);
      }
    }
  }
  const flagList = [...flags.values()].sort((x, y) => y.ts - x.ts);
  const flaggedTotal = (() => {
    // Money at risk = all but the first of each twin group.
    const seen = new Set<string>();
    let at = 0;
    [...flagList].sort((x, y) => x.ts - y.ts).forEach((f) => {
      if (seen.has(f.group)) at += f.amount;
      else seen.add(f.group);
    });
    return at;
  })();

  return {
    total: sum(sales),
    cashTotal: sum(cash),
    creditTotal: sum(credit),
    cashCount: cash.length,
    creditCount: credit.length,
    days: days.sort((a, b) => b.total - a.total),
    avgDay: Math.round(avg),
    flags: flagList,
    flaggedTotal,
  };
}
