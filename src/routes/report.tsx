import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { Icon } from "@/components/Icon";
import { Card, SectionTitle } from "@/components/ui-kit";
import { RangeBar, useRange } from "@/components/RangeExport";
import { ugx, useStore } from "@/lib/store";
import type { Sheet } from "@/lib/export";
import { exportTermReportCard } from "@/lib/operator-helpers";
import { useAuth } from "@/lib/auth";
import { checkSales } from "@/lib/sales-check";

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: "Balance Sheet & Term Report Card — SmartCanteen" },
      { name: "description", content: "Your cash, what you own and whether you are up or down this term — plus a shareable term report card." },
      { property: "og:title", content: "Balance Sheet & Term Report — SmartCanteen" },
      { property: "og:description", content: "Cash, stock on the shelf and credit owed to you, in plain words." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Report,
});

function Report() {
  const { state, totals, cashAtHand, shelfValueAtCost } = useStore();
  const { user } = useAuth();
  const range = useRange(state.termStartedAt);
  const [dayOrder, setDayOrder] = useState<"date" | "big">("date");
  const inRange = state.txs.filter((t) => range.has(t.ts) && t.type !== "capital");
  const isTerm = range.key === "Term";

  const sum = (type: string) =>
    inRange.filter((t) => t.type === type).reduce((a, t) => a + t.amount, 0);
  const sales = sum("sale");
  const stock = sum("stock");
  const expenses = sum("expense");
  const before = state.txs.filter((t) => t.ts < range.start);
  const opening = state.capital + before.reduce((a, t) => a + (t.type === "sale" ? t.amount : t.type === "capital" ? 0 : -t.amount), 0);
  const cashChange = sales - stock - expenses;
  const check = checkSales(inRange);
  const dayRows = [...check.days].sort((a, b) => (dayOrder === "date" ? a.ts - b.ts : b.total - a.total));
  const maxDay = Math.max(1, ...check.days.map((d) => d.total));
  const bigDay = (total: number) => check.avgDay > 0 && total > check.avgDay * 2.5;
  const bestDay = check.days[0];
  // Entries the Home screen counts but this period leaves out (dated before the term started).
  const outside = isTerm
    ? state.txs.filter((t) => t.type !== "capital" && t.ts < range.start).sort((a, b) => b.ts - a.ts)
    : [];
  const outsideNet = outside.reduce((a, t) => a + (t.type === "sale" ? t.amount : -t.amount), 0);
  const closing = opening + cashChange;

  const outstanding = state.debtors.reduce((a, d) => a + Math.max(0, d.amount - (d.payments ?? []).reduce((p, x) => p + x.amount, 0)), 0);
  const shelf = Math.round(shelfValueAtCost);

  // What the owner is worth today, and how that compares with the start of the term.
  const worthToday = closing + shelf + outstanding;
  const upDown = worthToday - opening;

  // Same idea for the whole term, used by the shareable report card.
  const startMoney = state.txs.find((t) => t.type === "capital")?.amount ?? state.capital;
  const termGain = cashAtHand + shelf + outstanding - startMoney;

  const expectedProfit = inRange
    .filter((t) => t.type === "stock")
    .reduce((total, t) => {
      if (t.units != null && t.sell != null) return total + t.units * t.sell - t.amount;
      // Older stock entries did not store quantity on the transaction. Use the
      // matching item's term margin so those records never appear as pure loss.
      const item = state.items.find((i) => i.id === t.itemId) ??
        state.items.find((i) => t.label.toLowerCase().startsWith(i.name.toLowerCase()));
      if (!item || item.buy <= 0) return total;
      const marginOnCost = (item.qty * item.sell - item.buy) / item.buy;
      return total + t.amount * marginOnCost;
    }, 0);

  const otherByCategory = Object.entries(
    inRange
      .filter((t) => t.type === "expense")
      .reduce<Record<string, number>>((acc, t) => {
        const k = t.category ?? "Other";
        acc[k] = (acc[k] ?? 0) + t.amount;
        return acc;
      }, {}),
  );
  const spendRows: [string, number][] = [
    ...(stock > 0 ? ([["Stock you bought", stock]] as [string, number][]) : []),
    ...otherByCategory,
  ].sort((a, b) => b[1] - a[1]);
  const spendTotal = stock + expenses;

  const cashRows: (string | number)[][] = [
    ["Money you started with", opening],
    ["Money from sales", sales],
    ["Spent buying stock", -stock],
    ["Other spending", -expenses],
    ["Cash you have now", closing],
  ];
  const ownRows: (string | number)[][] = isTerm
    ? [
        ["Stock on the shelf (what you paid for it)", shelf],
        ["Customers who owe you", outstanding],
        ["Total worth today", worthToday],
        [upDown >= 0 ? "Up since the start of term" : "Down since the start of term", upDown],
      ]
    : [];

  const sheets: Sheet[] = [
    {
      name: `Balance sheet (${range.label})`,
      columns: ["Line", "Amount (UGX)"],
      rows: [...cashRows, ...ownRows],
      summary: [
        ["Term", state.termName],
        ["Range", range.label],
        ...(isTerm ? [] : ([["Customers who owe you", `UGX ${ugx(outstanding)}`]] as [string, string][])),
      ],
    },
    {
      name: "Entries",
      columns: ["Date", "Type", "Description", "Category", "Amount (UGX)"],
      rows: [...inRange]
        .sort((a, b) => b.ts - a.ts)
        .map((t) => [
          new Date(t.ts).toLocaleDateString("en-GB"),
          t.type,
          t.label,
          t.category ?? "",
          t.amount,
        ]),
    },
  ];

  return (
    <AppLayout title="Reports">
      <RangeBar range={range} title={`Balance sheet — ${range.label}`} sheets={sheets} baseName="smartcanteen-report" />

      {outside.length > 0 ? (
        <Card className="space-y-2 border border-tertiary/40 bg-tertiary/5">
          <SectionTitle>Entries dated before this term</SectionTitle>
          <p className="text-sm text-on-surface">
            {outside.length} entr{outside.length === 1 ? "y is" : "ies are"} dated before the term start date, so the totals above leave {outside.length === 1 ? "it" : "them"} out. They move your profit by{" "}
            <span className="font-bold text-tertiary">{outsideNet < 0 ? "-" : ""}UGX {ugx(Math.abs(outsideNet))}</span>.
            If the date is a mistake, fix it in History.
          </p>
          {outside.slice(0, 8).map((t) => (
            <div key={t.id} className="flex justify-between gap-2 rounded-md bg-surface-lowest p-sm text-sm">
              <span className="min-w-0 truncate">
                {new Date(t.ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · {t.type} · {t.label}
              </span>
              <span className="shrink-0 font-bold">UGX {ugx(t.amount)}</span>
            </div>
          ))}
          <Link to="/history" className="inline-flex min-h-11 items-center font-bold text-primary underline">
            Open History to fix dates
          </Link>
        </Card>
      ) : null}

      <Card className="space-y-2">
        <SectionTitle>Your cash · {range.label}</SectionTitle>
        <Line label="Money you started with" value={opening} />
        <Line label="Money from sales" value={sales} sign="+" tone="primary" />
        {check.creditCount > 0 ? (
          <>
            <p className="pl-3 text-xs text-on-surface-variant">
              Cash sales UGX {ugx(check.cashTotal)} · Credit paid back UGX {ugx(check.creditTotal)} ({check.creditCount})
            </p>
          </>
        ) : null}
        <Line label="Spent buying stock" value={stock} sign="-" tone="tertiary" />
        <Line label="Other spending" value={expenses} sign="-" tone="tertiary" />
        <div className="mt-2 flex justify-between border-t border-outline-variant pt-2">
          <span className="font-bold text-on-surface">Cash you have now</span>
          <span className={`font-bold ${closing >= 0 ? "text-primary" : "text-tertiary"}`}>UGX {ugx(closing)}</span>
        </div>
        <p className="text-xs text-outline">Worked out from the entries in this period.</p>
      </Card>

      {isTerm ? (
        <Card className="space-y-2">
          <SectionTitle>What you also own</SectionTitle>
          <Line label="Cash you have now" value={closing} />
          <Line label="Stock on the shelf (what you paid for it)" value={shelf} sign="+" tone="primary" />
          <Line label="Customers who owe you" value={outstanding} sign="+" tone="primary" />
          <div className="mt-2 flex justify-between border-t border-outline-variant pt-2">
            <span className="font-bold text-on-surface">Total worth today</span>
            <span className="font-bold text-on-surface">UGX {ugx(worthToday)}</span>
          </div>
          <Line label="You started the term with" value={opening} />
          <div
            className={`mt-2 rounded-md p-sm ${upDown >= 0 ? "bg-primary/10" : "bg-tertiary/10"}`}
          >
            <p className={`text-base font-bold ${upDown >= 0 ? "text-primary" : "text-tertiary"}`}>
              {upDown === 0
                ? "You are level with the start of term"
                : `You are UGX ${ugx(Math.abs(upDown))} ${upDown > 0 ? "up" : "down"} since the start of term`}
            </p>
            <p className="mt-1 text-xs text-on-surface-variant">
              Stock on the shelf is an estimate from your stock records. Count your shelf weekly to keep it accurate.
            </p>
          </div>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-on-surface-variant">
            Choose <span className="font-bold text-on-surface">This Term</span> above to see what you own and whether you are up or down.
          </p>
        </Card>
      )}

      <Card className="space-y-sm">
        <SectionTitle>Sales by day · {range.label}</SectionTitle>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md bg-surface-lowest p-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-outline">Cash sales</p>
            <p className="mt-1 text-base font-bold tabular-nums text-on-surface">UGX {ugx(check.cashTotal)}</p>
            <p className="text-xs text-on-surface-variant">{check.cashCount} entries</p>
          </div>
          <div className="rounded-md bg-surface-lowest p-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-outline">Credit paid back</p>
            <p className="mt-1 text-base font-bold tabular-nums text-on-surface">UGX {ugx(check.creditTotal)}</p>
            <p className="text-xs text-on-surface-variant">{check.creditCount} payments</p>
          </div>
          <div className="rounded-md bg-primary/10 p-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-primary">Usual day</p>
            <p className="mt-1 text-base font-bold tabular-nums text-primary">UGX {ugx(check.avgDay)}</p>
            <p className="text-xs text-on-surface-variant">{check.days.length} days with sales</p>
          </div>
        </div>

        {check.days.length === 0 ? (
          <p className="text-sm text-outline">No sales in this range.</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-on-surface-variant">
                {bestDay ? `Best day: ${new Date(bestDay.ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
              </p>
              <div className="flex rounded-full bg-surface-high p-0.5 text-xs font-bold">
                {([["date", "By date"], ["big", "Biggest first"]] as const).map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setDayOrder(k)}
                    className={`min-h-8 rounded-full px-3 ${dayOrder === k ? "bg-primary text-on-primary" : "text-on-surface-variant"}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-outline-variant/40">
              {dayRows.map((d) => {
                const big = bigDay(d.total);
                return (
                  <div key={d.day} className="grid grid-cols-[84px_1fr_auto] items-center gap-3 py-2">
                    <div>
                      <p className="text-sm font-bold leading-4 text-on-surface">
                        {new Date(d.ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </p>
                      <p className="text-xs text-outline">
                        {new Date(d.ts).toLocaleDateString("en-GB", { weekday: "short" })} · {d.count} {d.count === 1 ? "entry" : "entries"}
                      </p>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-surface-highest">
                      <div
                        className={`h-full rounded-full ${big ? "bg-tertiary" : "bg-primary"}`}
                        style={{ width: `${Math.max(3, (d.total / maxDay) * 100)}%` }}
                      />
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold tabular-nums ${big ? "text-tertiary" : "text-on-surface"}`}>UGX {ugx(d.total)}</p>
                      {big ? <p className="text-[11px] font-bold text-tertiary">Above usual</p> : null}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-on-surface-variant">
              Orange = more than 2½ times a usual day. Check it is one day, not several added together.
            </p>
          </>
        )}
      </Card>

      {check.flags.length > 0 ? (
        <Card className="space-y-2 border border-tertiary/40 bg-tertiary/5">
          <SectionTitle>Possible double entries</SectionTitle>
          <p className="text-sm text-on-surface">
            {check.flags.length} sale entries look like repeats. If they are mistakes, your sales are up to{" "}
            <span className="font-bold text-tertiary">UGX {ugx(check.flaggedTotal)}</span> too high.
          </p>
          {check.flags.slice(0, 12).map((f) => (
            <div key={f.id} className="rounded-md bg-surface-lowest p-sm text-sm">
              <div className="flex justify-between gap-2">
                <span className="font-semibold text-on-surface">{f.label}</span>
                <span className="font-bold text-tertiary">UGX {ugx(f.amount)}</span>
              </div>
              <p className="text-xs text-on-surface-variant">
                {new Date(f.ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {f.reason}
              </p>
            </div>
          ))}
          <p className="text-xs text-on-surface-variant">
            Real repeats are fine (two customers can pay the same). Only fix the ones you did not mean to save.
          </p>
          <Link to="/history" className="inline-flex min-h-11 items-center gap-1 font-bold text-primary underline">
            Open History to fix entries
          </Link>
        </Card>
      ) : null}

      <div className="grid gap-sm sm:grid-cols-2">
        <Card>
          <p className="label-bold text-on-surface-variant">Cash change in this period</p>
          <p className={`price-display ${cashChange >= 0 ? "text-primary" : "text-tertiary"}`}>
            {cashChange < 0 ? "-" : ""}UGX {ugx(Math.abs(cashChange))}
          </p>
        </Card>
        <Card>
          <p className="label-bold text-on-surface-variant">Profit if all your stock sells</p>
          <p className="price-display text-secondary">UGX {ugx(expectedProfit)}</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            What you would make if everything you bought is sold at your selling prices.
          </p>
        </Card>
      </div>

      <Card className="space-y-2">
        <SectionTitle>Where the money went</SectionTitle>
        {spendRows.length === 0 && <p className="text-sm text-outline">Nothing spent in this range.</p>}
        {spendRows.map(([cat, amt]) => (
          <div key={cat}>
            <div className="flex justify-between text-sm">
              <span className="text-on-surface">{cat}</span>
              <span className="font-bold text-tertiary">UGX {ugx(amt)}</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-highest">
              <div
                className={`h-full rounded-full ${cat === "Stock you bought" ? "bg-secondary" : "bg-tertiary"}`}
                style={{ width: `${spendTotal ? (amt / spendTotal) * 100 : 0}%` }}
              />
            </div>
          </div>
        ))}
      </Card>

      <Card className="space-y-sm">
        <SectionTitle>Reports & exports</SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <HubLink to="/debtors" icon="group" label="Credit" />
          <HubLink to="/expense" icon="payments" label="Expenses" />
          <HubLink to="/stock" icon="inventory_2" label="Stock" />
          <HubLink to="/sale" icon="point_of_sale" label="Sales" />
        </div>
      </Card>

      <Card className="space-y-sm bg-surface-low">
        <SectionTitle>Term report card · {state.termName}</SectionTitle>
        <div className="grid grid-cols-2 gap-sm">
          <Mini label="Total sales" value={totals.sales} />
          <Mini label="Spent (stock + other)" value={totals.expenses + totals.stock} />
          <Mini label="Profit so far" value={termGain} signed />
          <Mini label="Owed to you" value={outstanding} />
        </div>
        <p className="text-xs text-on-surface-variant">
          Profit so far counts the stock still on your shelf and the money customers owe you.
        </p>
        <button
          type="button"
          onClick={() =>
            exportTermReportCard({
              termName: state.termName,
              school: user?.school,
              sales: totals.sales,
              stock: totals.stock,
              expenses: totals.expenses,
              net: termGain,
              expectedProfit,
              outstanding,
              cashAtHand,
              shelfValue: shelf,
              goal: state.savingsGoal,
              startedAt: state.termStartedAt,
            })
          }
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary font-bold text-on-primary"
        >
          <Icon name="picture_as_pdf" /> Share term report card (PDF)
        </button>
        <p className="text-xs text-on-surface-variant">Opens a clean one-page card — use Print → Save as PDF to share.</p>
      </Card>
    </AppLayout>
  );
}

function HubLink({ to, icon, label }: { to: "/debtors" | "/expense" | "/stock" | "/sale"; icon: string; label: string }) {
  return (
    <Link to={to} className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-md bg-surface-low text-sm font-bold text-primary">
      <Icon name={icon} /> {label}
    </Link>
  );
}

function Line({
  label,
  value,
  sign = "",
  tone,
}: {
  label: string;
  value: number;
  sign?: string;
  tone?: "primary" | "tertiary";
}) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-on-surface-variant">{label}</span>
      <span
        className={`shrink-0 font-semibold ${tone === "primary" ? "text-primary" : tone === "tertiary" ? "text-tertiary" : "text-on-surface"}`}
      >
        {sign}UGX {ugx(value)}
      </span>
    </div>
  );
}

function Mini({ label, value, signed = false }: { label: string; value: number; signed?: boolean }) {
  const tone = signed ? (value >= 0 ? "text-primary" : "text-tertiary") : "text-on-surface";
  return (
    <div className="rounded-md bg-surface-lowest p-sm">
      <p className="text-xs uppercase tracking-wide text-outline">{label}</p>
      <p className={`font-bold ${tone}`}>
        {value < 0 ? "-" : ""}UGX {ugx(Math.abs(value))}
      </p>
    </div>
  );
}
