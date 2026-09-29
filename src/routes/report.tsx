import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { Icon } from "@/components/Icon";
import { Card, SectionTitle } from "@/components/ui-kit";
import { RangeBar, useRange } from "@/components/RangeExport";
import { ugx, useStore } from "@/lib/store";
import type { Sheet } from "@/lib/export";
import { exportTermReportCard } from "@/lib/operator-helpers";
import { useAuth } from "@/lib/auth";

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

      <Card className="space-y-2">
        <SectionTitle>Your cash · {range.label}</SectionTitle>
        <Line label="Money you started with" value={opening} />
        <Line label="Money from sales" value={sales} sign="+" tone="primary" />
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
