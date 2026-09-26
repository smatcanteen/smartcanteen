import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Icon } from "@/components/Icon";
import { Card, Field, PrimaryButton, SectionTitle } from "@/components/ui-kit";
import { RangeBar, useRange } from "@/components/RangeExport";
import type { Sheet } from "@/lib/export";
import { dateInput, fromDateInput, ugx, useStore, type Debtor } from "@/lib/store";

export const Route = createFileRoute("/debtors")({
  head: () => ({
    meta: [
      { title: "Credit & Debtors — SmartCanteen" },
      { name: "description", content: "Track student credit separately from cash, record part payments, and export the debtor list." },
      { property: "og:title", content: "Credit & Debtors — SmartCanteen" },
      { property: "og:description", content: "Names, classes, balances, payment history and overdue flags for canteen credit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Debtors,
});

const paidSoFar = (d: Debtor) => (d.payments ?? []).reduce((a, p) => a + p.amount, 0);
const balanceOf = (d: Debtor) => Math.max(0, d.amount - paidSoFar(d));
const ageDays = (d: Debtor) => Math.floor((Date.now() - d.ts) / 86400000);

/** Green under a week, amber up to two, red beyond — same rule as the reminders. */
function aging(days: number) {
  if (days < 7) return { tone: "bg-primary/10 text-primary", label: "Under 7 days" };
  if (days <= 14) return { tone: "bg-secondary-container text-on-secondary-container", label: "7–14 days" };
  return { tone: "bg-error-container text-on-error-container", label: "Over 14 days" };
}

function Debtors() {
  const { state, payDebtor, addDebtor } = useStore();
  const range = useRange(state.termStartedAt);
  const [form, setForm] = useState({ name: "", klass: "", item: "", qty: "1", amount: "", when: dateInput(Date.now()) });
  const [payFor, setPayFor] = useState<{ id: string; mode: "partial" | "full" } | null>(null);
  const [pay, setPay] = useState({ amount: "", when: dateInput(Date.now()) });

  const open = state.debtors.filter((d) => balanceOf(d) > 0).slice().sort((a, b) => a.ts - b.ts);
  /** Oldest unpaid first — who to chase today. */
  const collectToday = open.filter((d) => ageDays(d) >= 3);
  const owed = open.reduce((a, d) => a + balanceOf(d), 0);
  const collected = state.debtors
    .flatMap((d) => d.payments ?? [])
    .filter((p) => range.has(p.ts))
    .reduce((a, p) => a + p.amount, 0);
  const oldest = open.slice().sort((a, b) => a.ts - b.ts)[0];

  const sheets: Sheet[] = [
    {
      name: "Debtors",
      columns: ["Student", "Class", "Item", "Qty", "Owed", "Paid", "Balance", "Age (days)"],
      rows: state.debtors.map((d) => [
        d.name,
        d.klass,
        d.item,
        d.qty ?? 1,
        d.amount,
        paidSoFar(d),
        balanceOf(d),
        ageDays(d),
      ]),
      summary: [
        ["Period", range.label],
        ["Total outstanding", `UGX ${ugx(owed)}`],
        ["Collected this period", `UGX ${ugx(collected)}`],
        ["Debtors owing", String(open.length)],
        ["Longest outstanding", oldest ? `${oldest.name} · ${ageDays(oldest)} days` : "None"],
      ],
    },
    {
      name: "Payments",
      columns: ["Date", "Student", "Amount (UGX)"],
      rows: state.debtors
        .flatMap((d) => (d.payments ?? []).filter((p) => range.has(p.ts)).map((p) => ({ d, p })))
        .sort((a, b) => b.p.ts - a.p.ts)
        .map(({ d, p }) => [new Date(p.ts).toLocaleDateString("en-GB"), d.name, p.amount]),
    },
  ];

  const submitPayment = () => {
    if (!payFor) return;
    const d = state.debtors.find((x) => x.id === payFor.id);
    if (!d) return;
    const amount = payFor.mode === "full" ? balanceOf(d) : Number(pay.amount) || 0;
    if (amount <= 0) return;
    payDebtor(d.id, amount, fromDateInput(pay.when));
    setPayFor(null);
    setPay({ amount: "", when: dateInput(Date.now()) });
  };

  return (
    <AppLayout title="Credit">
      <RangeBar range={range} title={`Credit & debtors — ${range.label}`} sheets={sheets} baseName="smartcanteen-debtors" />

      <div className="grid grid-cols-2 gap-sm">
        <Card>
          <p className="label-bold text-on-surface-variant">Outstanding</p>
          <p className="price-display text-tertiary">UGX {ugx(owed)}</p>
        </Card>
        <Card>
          <p className="label-bold text-on-surface-variant">Collected · {range.label}</p>
          <p className="price-display text-primary">UGX {ugx(collected)}</p>
        </Card>
        <Card>
          <p className="label-bold text-on-surface-variant">Debtors owing</p>
          <p className="price-display text-on-surface">{open.length}</p>
        </Card>
        <Card>
          <p className="label-bold text-on-surface-variant">Longest outstanding</p>
          <p className="font-bold text-on-surface">{oldest ? oldest.name : "—"}</p>
          <p className="text-xs text-outline">{oldest ? `${ageDays(oldest)} days · UGX ${ugx(balanceOf(oldest))}` : "Nothing overdue"}</p>
        </Card>
      </div>

      <p className="text-xs text-outline">Credit never touches Cash at Hand until a payment is recorded.</p>

      {collectToday.length > 0 && (
        <Card className="space-y-sm border border-secondary/40 bg-secondary/10">
          <SectionTitle>Collect today</SectionTitle>
          <p className="text-xs text-on-surface-variant">
            Unpaid 3+ days — oldest first. Tap Full or Partial on each card below.
          </p>
          {collectToday.slice(0, 8).map((d) => {
            const days = ageDays(d);
            const bal = balanceOf(d);
            const flag = aging(days);
            return (
              <div key={d.id} className="flex items-center justify-between gap-2 rounded-md bg-surface-lowest p-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-on-surface">{d.name}</p>
                  <p className="text-[11px] text-on-surface-variant">
                    {d.klass || "—"} · {days}d · <span className={`font-bold ${flag.tone.includes("error") ? "text-tertiary" : ""}`}>{flag.label}</span>
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold tabular-nums text-tertiary">UGX {ugx(bal)}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setPayFor({ id: d.id, mode: "full" });
                      setPay({ amount: String(bal), when: dateInput(Date.now()) });
                    }}
                    className="text-[11px] font-bold text-primary"
                  >
                    Collect →
                  </button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <section>
        <SectionTitle>All debtors</SectionTitle>
        <div className="space-y-sm">
          {state.debtors.length === 0 && <p className="text-sm text-outline">No credit given yet.</p>}
          {[...state.debtors].sort((a, b) => {
            const ba = balanceOf(a);
            const bb = balanceOf(b);
            if (ba > 0 && bb <= 0) return -1;
            if (bb > 0 && ba <= 0) return 1;
            return a.ts - b.ts;
          }).map((d) => {
            const days = ageDays(d);
            const bal = balanceOf(d);
            const flag = aging(days);
            const payments = (d.payments ?? []).slice().sort((a, b) => b.ts - a.ts);
            return (
              <Card key={d.id} className="space-y-sm">
                <div className="flex items-start justify-between gap-sm">
                  <div className="min-w-0">
                    <p className="font-bold text-on-surface">{d.name}</p>
                    <p className="text-xs text-outline">
                      {d.klass} · {d.item}
                      {d.qty ? ` ×${d.qty}` : ""} · {days}d ago
                    </p>
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${flag.tone}`}>
                      {bal > 0 ? flag.label : "Settled"}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${bal > 0 ? "text-tertiary" : "text-primary"}`}>UGX {ugx(bal)}</p>
                    <p className="text-[11px] text-outline">of UGX {ugx(d.amount)}</p>
                  </div>
                </div>

                {bal > 0 && (
                  <div className="flex gap-sm">
                    <button
                      onClick={() => {
                        setPayFor({ id: d.id, mode: "partial" });
                        setPay({ amount: "", when: dateInput(Date.now()) });
                      }}
                      className="h-11 min-h-11 flex-1 rounded-md bg-surface-high text-sm font-bold text-on-surface-variant"
                    >
                      Partial Payment
                    </button>
                    <button
                      onClick={() => {
                        setPayFor({ id: d.id, mode: "full" });
                        setPay({ amount: String(bal), when: dateInput(Date.now()) });
                      }}
                      className="h-11 min-h-11 flex-1 rounded-md bg-primary text-sm font-bold text-on-primary"
                    >
                      Full Payment
                    </button>
                  </div>
                )}

                {payFor?.id === d.id && (
                  <div className="space-y-sm rounded-md bg-surface-low p-sm">
                    <Field
                      label={`Amount received (max UGX ${ugx(bal)})`}
                      inputMode="numeric"
                      value={payFor.mode === "full" ? String(bal) : pay.amount}
                      disabled={payFor.mode === "full"}
                      onChange={(e) => setPay({ ...pay, amount: e.target.value.replace(/\D/g, "") })}
                    />
                    <Field
                      label="Date payment was made"
                      type="date"
                      value={pay.when}
                      onChange={(e) => setPay({ ...pay, when: e.target.value })}
                      hint="Back-date it if the money came in earlier"
                    />
                    <div className="flex gap-sm">
                      <button
                        onClick={() => setPayFor(null)}
                        className="h-11 min-h-11 flex-1 rounded-md bg-surface-high text-sm font-bold text-on-surface-variant"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={submitPayment}
                        className="h-11 min-h-11 flex-1 rounded-md bg-primary text-sm font-bold text-on-primary"
                      >
                        Save payment
                      </button>
                    </div>
                  </div>
                )}

                {payments.length > 0 && (
                  <div className="border-t border-outline-variant pt-2">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-outline">Payment history</p>
                    {payments.map((p) => (
                      <div key={p.id} className="flex justify-between text-xs text-on-surface-variant">
                        <span>{new Date(p.ts).toLocaleDateString("en-GB")}</span>
                        <span className="font-bold text-primary">UGX {ugx(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      <Card className="space-y-sm">
        <SectionTitle>Add a credit sale</SectionTitle>
        <div className="grid gap-sm sm:grid-cols-2">
          <Field label="Student name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Field label="Class / section" value={form.klass} onChange={(e) => setForm({ ...form, klass: e.target.value })} />
          <Field label="Item" value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} />
          <Field
            label="Quantity"
            inputMode="numeric"
            value={form.qty}
            onChange={(e) => setForm({ ...form, qty: e.target.value.replace(/\D/g, "") })}
          />
          <Field
            label="Amount (UGX)"
            inputMode="numeric"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/\D/g, "") })}
          />
          <Field label="Date given" type="date" value={form.when} onChange={(e) => setForm({ ...form, when: e.target.value })} />
        </div>
        <PrimaryButton
          tone="cta"
          disabled={!form.name || !(Number(form.amount) > 0)}
          onClick={() => {
            addDebtor({
              name: form.name,
              klass: form.klass,
              item: form.item,
              qty: Number(form.qty) || 1,
              amount: Number(form.amount),
              ts: fromDateInput(form.when),
            });
            setForm({ name: "", klass: "", item: "", qty: "1", amount: "", when: dateInput(Date.now()) });
          }}
        >
          <Icon name="person_add" /> Record credit
        </PrimaryButton>
      </Card>
    </AppLayout>
  );
}
