import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, Field, PrimaryButton, SectionTitle, SelectField } from "@/components/ui-kit";
import { Kpi } from "@/components/AdminShell";
import { useAuth } from "@/lib/auth";
import { dateInput } from "@/lib/store";
import { fmtDate, ugxDisplay, usePlatform } from "@/lib/platform";

export const Route = createFileRoute("/admin/finance")({
  head: () => ({
    meta: [
      { title: "Finance — SmartCanteen Admin" },
      {
        name: "description",
        content: "Track subscription income in and company expenses out for SmartCanteen.",
      },
    ],
  }),
  component: FinancePage,
});

const EXPENSE_CATS = [
  "Agent payout",
  "Airtime / data",
  "Marketing",
  "Transport",
  "Office / rent",
  "Software",
  "Other",
];

function monthKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function FinancePage() {
  const { user } = useAuth();
  const { s, addExpense, removeExpense, logAction } = usePlatform();
  const [err, setErr] = useState("");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState(EXPENSE_CATS[0]!);
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  const [when, setWhen] = useState(dateInput(Date.now()));
  const [month, setMonth] = useState(() => monthKey(Date.now()));

  const payments = s.payments ?? [];
  const expenses = s.expenses ?? [];

  const months = useMemo(() => {
    const keys = new Set<string>();
    payments.forEach((p) => keys.add(monthKey(p.ts)));
    expenses.forEach((e) => keys.add(monthKey(e.ts)));
    keys.add(monthKey(Date.now()));
    return [...keys].sort().reverse();
  }, [payments, expenses]);

  const monthPayments = payments.filter((p) => monthKey(p.ts) === month);
  const monthExpenses = expenses.filter((e) => monthKey(e.ts) === month);
  const income = monthPayments.reduce((a, p) => a + p.amount, 0);
  const out = monthExpenses.reduce((a, e) => a + e.amount, 0);
  const net = income - out;

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    monthExpenses.forEach((e) => {
      map[e.category] = (map[e.category] ?? 0) + e.amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [monthExpenses]);

  const saveExpense = () => {
    const ts = new Date(`${when}T12:00:00`).getTime();
    const res = addExpense({
      label,
      category,
      amount: Number(amount) || 0,
      ref,
      who: user?.name ?? "admin",
      ts: Number.isFinite(ts) ? ts : Date.now(),
    });
    if (!res.ok) {
      setErr(res.error ?? "Could not save");
      return;
    }
    setErr("");
    setLabel("");
    setAmount("");
    setRef("");
    setWhen(dateInput(Date.now()));
  };

  const exportCsv = () => {
    const lines = [
      ["Type", "Date", "Label", "Category / school", "Amount", "Reference", "By"].join(","),
      ...monthPayments.map((p) => {
        const t = s.tenants.find((x) => x.accountId === p.accountId);
        return ["Income", fmtDate(p.ts), t?.canteenName ?? p.accountId, t?.school ?? "", p.amount, p.ref, p.who]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(",");
      }),
      ...monthExpenses.map((e) =>
        ["Expense", fmtDate(e.ts), e.label, e.category, e.amount, e.ref ?? "", e.who]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `smartcanteen-finance-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    logAction(user?.name ?? "admin", `Exported finance CSV for ${month}`);
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Company books</p>
          <h1 className="text-2xl font-extrabold text-on-surface sm:text-3xl">Finance</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Money in from subscriptions. Money out for running the business.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <SelectField label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </SelectField>
          <button
            type="button"
            onClick={exportCsv}
            className="min-h-11 rounded-full border-2 border-outline-variant px-4 text-sm font-bold text-on-surface"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-sm md:grid-cols-4">
        <Kpi label="Income" value={`UGX ${ugxDisplay(income)}`} sub={`${monthPayments.length} payments`} icon="trending_up" />
        <Kpi label="Expenses" value={`UGX ${ugxDisplay(out)}`} sub={`${monthExpenses.length} entries`} icon="trending_down" />
        <Kpi
          label="Net"
          value={`UGX ${ugxDisplay(net)}`}
          sub={net >= 0 ? "In the black" : "In the red"}
          icon="account_balance_wallet"
        />
        <Kpi
          label="All-time income"
          value={`UGX ${ugxDisplay(payments.reduce((a, p) => a + p.amount, 0))}`}
          sub={`${payments.length} confirmed`}
          icon="payments"
        />
      </div>

      <div className="grid gap-md lg:grid-cols-2">
        <Card className="space-y-sm">
          <SectionTitle>Money in · subscriptions</SectionTitle>
          {monthPayments.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No confirmed payments this month.</p>
          ) : null}
          {monthPayments
            .slice()
            .sort((a, b) => b.ts - a.ts)
            .map((p) => {
              const t = s.tenants.find((x) => x.accountId === p.accountId);
              return (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-lowest p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-on-surface">{t?.canteenName ?? p.accountId}</p>
                    <p className="text-xs text-on-surface-variant">
                      {fmtDate(p.ts)} · ref {p.ref} · {p.who}
                      {p.note ? ` · ${p.note}` : ""}
                    </p>
                  </div>
                  <p className="font-bold tabular-nums text-primary">+ UGX {ugxDisplay(p.amount)}</p>
                </div>
              );
            })}
        </Card>

        <Card className="space-y-sm">
          <SectionTitle>Money out · expenses</SectionTitle>
          {byCategory.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {byCategory.map(([cat, total]) => (
                <span key={cat} className="rounded-full bg-surface-high px-3 py-1 text-xs font-bold text-on-surface">
                  {cat}: UGX {ugxDisplay(total)}
                </span>
              ))}
            </div>
          ) : null}
          {monthExpenses.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No expenses logged this month.</p>
          ) : null}
          {monthExpenses
            .slice()
            .sort((a, b) => b.ts - a.ts)
            .map((e) => (
              <div
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-lowest p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-bold text-on-surface">{e.label}</p>
                  <p className="text-xs text-on-surface-variant">
                    {fmtDate(e.ts)} · {e.category} · {e.who}
                    {e.ref ? ` · ${e.ref}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="font-bold tabular-nums text-tertiary">− UGX {ugxDisplay(e.amount)}</p>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Remove expense “${e.label}”?`)) removeExpense(e.id);
                    }}
                    className="text-xs font-bold text-on-surface-variant underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
        </Card>
      </div>

      <Card className="space-y-sm">
        <SectionTitle>Log an expense</SectionTitle>
        {err ? <p className="text-sm font-bold text-tertiary">{err}</p> : null}
        <div className="grid gap-sm sm:grid-cols-2 lg:grid-cols-3">
          <Field label="What for" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Agent payout Sarah" />
          <SelectField label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {EXPENSE_CATS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectField>
          <Field
            label="Amount (UGX)"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
          />
          <Field label="Date" type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
          <Field label="Reference (optional)" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="MoMo / receipt" />
        </div>
        <PrimaryButton onClick={saveExpense}>Save expense</PrimaryButton>
      </Card>
    </>
  );
}
