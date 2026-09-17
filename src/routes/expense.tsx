import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout, Saved } from "@/components/AppLayout";
import { Icon } from "@/components/Icon";
import { Card, Field, MicButton, PrimaryButton, SectionTitle } from "@/components/ui-kit";
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
  const { state, addTx, undoLast, cashAtHand } = useStore();
  const cats = state.expenseCategories;
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

  const save = () => {
    if (value <= 0) return;
    const label =
      category === "Allowances" && who.trim()
        ? `Allowance — ${who.trim()}`
        : category + (recurring ? " (recurring)" : "");
    addTx({ type: "expense", label, category, amount: value, ts: fromDateInput(when) });
    setAmount("");
    setWho("");
    setSaved(true);
    setTimeout(() => setSaved(false), 4000);
  };

  return (
    <AppLayout title="Expense" back>
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
          <label className="flex min-h-11 items-center justify-between">
            <span className="text-sm font-bold text-on-surface-variant">Recurring each period</span>
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              className="h-6 w-6 accent-[#822912]"
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
