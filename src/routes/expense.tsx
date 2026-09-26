import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout, Saved } from "@/components/AppLayout";
import { Icon } from "@/components/Icon";
import { Card, Field, MicButton, PrimaryButton, SectionTitle } from "@/components/ui-kit";
import { DataTable, RangeBar, useRange } from "@/components/RangeExport";
import type { Sheet } from "@/lib/export";
import { parseExpense } from "@/lib/voice";
import { useDraft } from "@/lib/draft";
import { dateInput, fromDateInput, ugx, useStore } from "@/lib/store";

export const Route = createFileRoute("/expense")({
  head: () => ({
    meta: [
      { title: "Expense Entry — SmartCanteen" },
      { name: "description", content: "Log transport, salary, allowances, airtime and any category you add — Cash at Hand updates itself." },
      { property: "og:title", content: "Expense Entry — SmartCanteen" },
      { property: "og:description", content: "Category chips, voice entry and back-dating for canteen expenses." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Expense,
});

function Expense() {
  const { state, addTx, undoLast, cashAtHand, scheduleRecurring, logRecurringDue } = useStore();
  const cats = state.expenseCategories;
  const dueRecurring = (state.recurringExpenses ?? []).filter((r) => r.nextDue <= Date.now());
  // Half-typed expenses survive an interruption until they are saved.
  const draft = useDraft("expense", {
    category: cats[0]?.label ?? "Transport",
    amount: "",
    who: "",
    when: dateInput(Date.now()),
    recurring: false,
  });
  const { category, amount, who, when, recurring } = draft.value;
  const setCategory = (v: string) => draft.setValue((d) => ({ ...d, category: v }));
  const setAmount = (v: string) => draft.setValue((d) => ({ ...d, amount: v }));
  const setWho = (v: string) => draft.setValue((d) => ({ ...d, who: v }));
  const setWhen = (v: string) => draft.setValue((d) => ({ ...d, when: v }));
  const setRecurring = (v: boolean) => draft.setValue((d) => ({ ...d, recurring: v }));
  const [saved, setSaved] = useState(false);
  const value = Number(amount) || 0;
  const range = useRange(state.termStartedAt);
  const expenses = state.txs.filter((t) => t.type === "expense" && range.has(t.ts));
  const byCategory = Object.entries(
    expenses.reduce<Record<string, number>>((all, t) => {
      const key = t.category ?? "Miscellaneous";
      all[key] = (all[key] ?? 0) + t.amount;
      return all;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const spent = expenses.reduce((sum, t) => sum + t.amount, 0);
  const expenseSheet: Sheet = {
    name: "Expenses",
    columns: ["Date", "Category", "Description", "Amount (UGX)"],
    rows: [...expenses].sort((a, b) => b.ts - a.ts).map((t) => [
      new Date(t.ts).toLocaleDateString("en-GB"), t.category ?? "Miscellaneous", t.label, t.amount,
    ]),
    summary: [["Period", range.label], ["Total spent", `UGX ${ugx(spent)}`]],
  };

  const save = () => {
    if (value <= 0) return;
    const label =
      category === "Allowances" && who.trim()
        ? `Allowance — ${who.trim()}`
        : category + (recurring ? " (recurring)" : "");
    addTx({ type: "expense", label, category, amount: value, ts: fromDateInput(when) });
    if (recurring && category === "Rent") {
      scheduleRecurring({ category, label, amount: value, everyDays: 30 });
    }
    draft.clearDraft();
    draft.setValue((d) => ({ ...d, amount: "", who: "", recurring: false }));
    setSaved(true);
    setTimeout(() => setSaved(false), 4000);
  };

  return (
    <AppLayout title="Expense" back>
      <RangeBar range={range} title={`Expense report — ${range.label}`} sheets={[expenseSheet]} baseName="smartcanteen-expenses" />

      {dueRecurring.length > 0 && (
        <Card className="space-y-2 border border-secondary/30 bg-secondary/10">
          <SectionTitle>Due recurring costs</SectionTitle>
          {dueRecurring.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">{r.category} · UGX {ugx(r.amount)}</p>
              <button
                type="button"
                onClick={() => logRecurringDue(r.id)}
                className="min-h-10 rounded-md bg-primary px-3 text-xs font-bold text-on-primary"
              >
                Log now
              </button>
            </div>
          ))}
        </Card>
      )}

      <Card className="space-y-sm">
        <div className="flex items-end justify-between gap-2">
          <SectionTitle>Spending summary</SectionTitle>
          <p className="font-bold text-tertiary">UGX {ugx(spent)}</p>
        </div>
        <DataTable
          columns={["Category", "Amount (UGX)"]}
          rows={byCategory.map(([cat, total]) => [cat, total])}
          empty="No expenses in this period."
        />
      </Card>

      <section>
        <div className="mb-sm flex items-end justify-between px-1">
          <h2 className="label-bold text-on-surface-variant">Category</h2>
          <Link to="/settings" className="text-xs font-bold text-primary hover:underline">
            + Add category
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-sm sm:grid-cols-3 lg:grid-cols-4">
          {cats.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.label)}
              aria-pressed={category === c.label}
              className={`flex min-h-16 items-center gap-sm rounded-lg px-3 text-left font-bold transition-colors ${
                category === c.label
                  ? "bg-tertiary text-on-tertiary shadow-raised"
                  : "bg-surface-lowest text-on-surface shadow-card hover:bg-surface-low"
              }`}
            >
              <Icon name={c.icon} />
              <span className="text-sm leading-tight">{c.label}</span>
            </button>
          ))}
        </div>
      </section>

      <Card className="space-y-sm">
        <div className="flex items-start gap-sm">
          <div className="flex-grow">
            <Field
              label={`Amount (UGX) — ${category}`}
              inputMode="numeric"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
              hint="Or say it: “transport fifteen thousand”"
            />
          </div>
          <MicButton
            onResult={(t) => {
              const r = parseExpense(t, cats);
              if (r.category) setCategory(r.category);
              if (r.amount > 0) setAmount(String(r.amount));
            }}
          />
        </div>

        <div className="grid gap-sm sm:grid-cols-2">
          <Field
            label="Date of expense"
            type="date"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            hint="Back-date anything you forgot to log"
          />
          {category === "Allowances" && (
            <Field label="For (name)" value={who} onChange={(e) => setWho(e.target.value)} placeholder="e.g. Sarah" />
          )}
        </div>

        {category === "Rent" && (
          <label className="flex min-h-11 items-center justify-between gap-3">
            <span className="text-sm font-bold text-on-surface-variant">
              Recurring every 30 days
              <span className="mt-0.5 block text-xs font-normal text-on-surface-variant">
                Saves this amount now and reminds you next month to log it again.
              </span>
            </span>
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              className="h-6 w-6 shrink-0 accent-[#822912]"
            />
          </label>
        )}
        <p className="text-xs text-on-surface-variant">Cash at Hand becomes UGX {ugx(cashAtHand - value)}</p>
      </Card>

      <PrimaryButton tone="negative" onClick={save} disabled={value <= 0}>
        <Icon name="check" /> Save expense
      </PrimaryButton>
      <Saved show={saved} onUndo={() => { undoLast(); setSaved(false); }} />
    </AppLayout>
  );
}
