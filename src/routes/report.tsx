import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { Icon } from "@/components/Icon";
import { Card, SectionTitle } from "@/components/ui-kit";
import { RangeBar, useRange } from "@/components/RangeExport";
import { ugx, useStore } from "@/lib/store";
import type { Sheet } from "@/lib/export";

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: "Balance Sheet & Term Report Card — SmartCanteen" },
      { name: "description", content: "Opening balance, sales, stock, expenses and closing balance — plus a shareable term report card." },
      { property: "og:title", content: "Balance Sheet & Term Report — SmartCanteen" },
      { property: "og:description", content: "Expected profit next to actual net change, for any day, week or term." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Report,
});

function Report() {
  const { state, totals } = useStore();
  const range = useRange(state.termStartedAt);
  const inRange = state.txs.filter((t) => range.has(t.ts) && t.type !== "capital");

  const sum = (type: string) =>
    inRange.filter((t) => t.type === type).reduce((a, t) => a + t.amount, 0);
  const sales = sum("sale");
  const stock = sum("stock");
  const expenses = sum("expense");
  const before = state.txs.filter((t) => t.ts < range.start);
  const opening = state.capital + before.reduce((a, t) => a + (t.type === "sale" ? t.amount : t.type === "capital" ? 0 : -t.amount), 0);
  const actualNet = sales - stock - expenses;
  const closing = opening + actualNet;
  const expectedProfit = inRange
    .filter((t) => t.type === "stock")
    .reduce((a, t) => a + (t.units ?? 0) * (t.sell ?? 0) - t.amount, 0);
  const outstanding = state.debtors.reduce((a, d) => a + Math.max(0, d.amount - (d.payments ?? []).reduce((p, x) => p + x.amount, 0)), 0);

  const byCategory = Object.entries(
    inRange
      .filter((t) => t.type === "expense")
      .reduce<Record<string, number>>((acc, t) => {
        const k = t.category ?? "Other";
        acc[k] = (acc[k] ?? 0) + t.amount;
        return acc;
      }, {}),
  ).sort((a, b) => b[1] - a[1]);

  const sheets: Sheet[] = [
    {
      name: `Balance sheet (${range.label})`,
      columns: ["Line", "Amount (UGX)"],
      rows: [
        ["Opening balance", opening],
        ["Plus sales", sales],
        ["Less stock purchases", -stock],
        ["Less other expenses", -expenses],
        ["Closing balance", closing],
      ],
      summary: [
        ["Term", state.termName],
        ["Range", range.label],
        ["Outstanding credit", `UGX ${ugx(outstanding)}`],
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
        <SectionTitle>Balance sheet · {range.label}</SectionTitle>
        <Line label="Opening balance" value={opening} />
        <Line label="Plus sales" value={sales} sign="+" tone="primary" />
        <Line label="Less stock purchases" value={stock} sign="-" tone="tertiary" />
        <Line label="Less other expenses" value={expenses} sign="-" tone="tertiary" />
        <div className="mt-2 flex justify-between border-t border-outline-variant pt-2">
          <span className="font-bold text-on-surface">Closing balance</span>
          <span className="font-bold text-primary">UGX {ugx(closing)}</span>
        </div>
        <p className="text-xs text-outline">Matches Cash at Hand exactly.</p>
      </Card>

      <div className="grid gap-sm sm:grid-cols-2">
        <Card>
          <p className="label-bold text-on-surface-variant">Expected profit (from stockings)</p>
          <p className="price-display text-secondary">UGX {ugx(expectedProfit)}</p>
        </Card>
        <Card>
          <p className="label-bold text-on-surface-variant">Actual net change</p>
          <p className="price-display text-primary">UGX {ugx(actualNet)}</p>
        </Card>
      </div>

      <Card className="space-y-2">
        <SectionTitle>Where the money went</SectionTitle>
        {byCategory.length === 0 && <p className="text-sm text-outline">No expenses in this range.</p>}
        {byCategory.map(([cat, amt]) => (
          <div key={cat}>
            <div className="flex justify-between text-sm">
              <span className="text-on-surface">{cat}</span>
              <span className="font-bold text-tertiary">UGX {ugx(amt)}</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-highest">
              <div
                className="h-full rounded-full bg-tertiary"
                style={{ width: `${expenses ? (amt / expenses) * 100 : 0}%` }}
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
          <Mini label="Total expenses" value={totals.expenses + totals.stock} />
          <Mini label="Net profit" value={totals.sales - totals.expenses - totals.stock} />
          <Mini label="Outstanding credit" value={outstanding} />
        </div>
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
    <div className="flex justify-between text-sm">
      <span className="text-on-surface-variant">{label}</span>
      <span
        className={`font-semibold ${tone === "primary" ? "text-primary" : tone === "tertiary" ? "text-tertiary" : "text-on-surface"}`}
      >
        {sign}UGX {ugx(value)}
      </span>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-surface-lowest p-sm">
      <p className="text-xs uppercase tracking-wide text-outline">{label}</p>
      <p className="font-bold text-on-surface">UGX {ugx(value)}</p>
    </div>
  );
}
