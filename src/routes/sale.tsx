import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout, Saved } from "@/components/AppLayout";
import { Icon } from "@/components/Icon";
import { Card, Field, Keypad, MicButton, PrimaryButton, SectionTitle } from "@/components/ui-kit";
import { DataTable, RangeBar, useRange } from "@/components/RangeExport";
import type { Sheet } from "@/lib/export";
import { parseAmount } from "@/lib/voice";
import { useDraft } from "@/lib/draft";
import { dateInput, fromDateInput, ugx, useStore } from "@/lib/store";

export const Route = createFileRoute("/sale")({
  head: () => ({
    meta: [
      { title: "Cash Sale — SmartCanteen" },
      { name: "description", content: "Record a cash sale in seconds with the keypad, or itemize it so stock drops automatically." },
      { property: "og:title", content: "Cash Sale — SmartCanteen" },
      { property: "og:description", content: "Fast keypad sale entry that updates Cash at Hand and stock levels." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Sale,
});

type SaleDraft = {
  amount: string;
  itemize: boolean;
  credit: boolean;
  when: string;
  debtor: { name: string; klass: string };
  picked: Record<string, number>;
};

function Sale() {
  const { state, addTx, addDebtor, sellItems, undoLast, cashAtHand } = useStore();
  // Work in progress is kept on the device until the sale is actually saved.
  const draft = useDraft<SaleDraft>("sale", {
    amount: "",
    itemize: false,
    credit: false,
    when: dateInput(Date.now()),
    debtor: { name: "", klass: "" },
    picked: {},
  });
  const { amount, itemize, credit, when, debtor, picked } = draft.value;
  const patch = (p: Partial<SaleDraft>) => draft.setValue((v) => ({ ...v, ...p }));
  const setAmount = (fn: string | ((a: string) => string)) =>
    draft.setValue((v) => ({ ...v, amount: typeof fn === "function" ? fn(v.amount) : fn }));
  const setItemize = (itemizeNext: boolean) => patch({ itemize: itemizeNext });
  const setCredit = (c: boolean) => patch({ credit: c });
  const setWhen = (w: string) => patch({ when: w });
  const setDebtor = (d: { name: string; klass: string }) => patch({ debtor: d });
  const setPicked = (fn: (p: Record<string, number>) => Record<string, number>) =>
    draft.setValue((v) => ({ ...v, picked: fn(v.picked) }));
  const [saved, setSaved] = useState(false);
  const range = useRange(state.termStartedAt);
  const sales = state.txs.filter((t) => t.type === "sale" && range.has(t.ts));
  const daily = Object.entries(
    sales.reduce<Record<string, number>>((all, t) => {
      const day = new Date(t.ts).toLocaleDateString("en-GB");
      all[day] = (all[day] ?? 0) + t.amount;
      return all;
    }, {}),
  );
  const selectedTotal = sales.reduce((a, t) => a + t.amount, 0);
  const previousTotal = state.txs
    .filter((t) => t.type === "sale" && t.ts >= range.previous.start && t.ts <= range.previous.end)
    .reduce((a, t) => a + t.amount, 0);
  const difference = selectedTotal - previousTotal;
  const change = previousTotal ? (difference / previousTotal) * 100 : selectedTotal ? 100 : 0;
  const salesSheet: Sheet = {
    name: "Daily sales",
    columns: ["Date", "Total sold (UGX)"],
    rows: daily,
    summary: [["Period", range.label], ["Total sold", `UGX ${ugx(selectedTotal)}`], ["Previous period", `UGX ${ugx(previousTotal)}`]],
  };

  const itemTotal = Object.entries(picked).reduce((a, [id, q]) => {
    const it = state.items.find((i) => i.id === id);
    return a + (it ? it.sell * q : 0);
  }, 0);
  const total = itemize ? itemTotal : Number(amount) || 0;

  const press = (k: string) =>
    setAmount((a) => (k === "back" ? a.slice(0, -1) : (a + k).replace(/^0+(?=\d)/, "")));

  const handleSave = () => {
    if (total <= 0) return;
    const ts = fromDateInput(when);
    if (itemize) {
      // Itemised sales always draw the units off the shelf.
      const lines = Object.entries(picked)
        .filter(([, q]) => q > 0)
        .map(([itemId, qty]) => ({ itemId, qty }));
      const { label } = sellItems(lines, { ts, credit });
      if (credit) {
        addDebtor({
          name: debtor.name || "Unnamed student",
          klass: debtor.klass,
          item: label,
          qty: lines.reduce((sum, line) => sum + line.qty, 0),
          amount: total,
          ts,
        });
      }
    } else if (credit) {
      addDebtor({ name: debtor.name || "Unnamed student", klass: debtor.klass, item: "Cash sale", qty: 1, amount: total, ts });
    } else {
      addTx({ type: "sale", label: "Cash sale", amount: total, ts });
    }
    draft.clearDraft();
    draft.setValue((v) => ({ ...v, amount: "", picked: {}, debtor: { name: "", klass: "" } }));
    setSaved(true);
    setTimeout(() => setSaved(false), 4000);
  };

  return (
    <AppLayout title="Cash Sale" back>
      <RangeBar range={range} title={`Sales report — ${range.label}`} sheets={[salesSheet]} baseName="smartcanteen-sales" />
      <Card className="space-y-sm">
        <SectionTitle>Sales by day</SectionTitle>
        <p className={`text-sm font-bold ${difference >= 0 ? "text-primary" : "text-tertiary"}`}>
          {difference >= 0 ? "↑" : "↓"} {difference >= 0 ? "Up" : "Down"} {Math.abs(change).toFixed(0)}% from the preceding period · {difference >= 0 ? "+" : "−"}UGX {ugx(Math.abs(difference))}
        </p>
        <DataTable columns={["Date", "Total sold (UGX)"]} rows={daily} pageSize={7} empty="No sales in this period." />
      </Card>

      <div className="flex items-center justify-between rounded-lg bg-surface-container p-1">
        {[
          { l: "Simple", v: false },
          { l: "Itemize", v: true },
        ].map((t) => (
          <button
            key={t.l}
            onClick={() => setItemize(t.v)}
            aria-pressed={itemize === t.v}
            className={`h-11 min-h-11 flex-1 rounded-md text-sm font-bold transition-colors ${
              itemize === t.v ? "bg-primary text-on-primary" : "text-on-surface-variant"
            }`}
          >
            {t.l}
          </button>
        ))}
      </div>

      <Card className="text-center">
        <p className="label-bold text-on-surface-variant">Sale amount</p>
        <p className="price-display mt-1 text-primary">UGX {ugx(total)}</p>
        <p className="mt-1 text-xs text-on-surface-variant">
          Cash at Hand becomes UGX {ugx(cashAtHand + (credit ? 0 : total))}
          {itemize ? " · stock drops automatically" : ""}
        </p>
      </Card>

      {itemize ? (
        <div className="space-y-sm">
          {state.items.length === 0 && (
            <p className="text-sm text-on-surface-variant">No stock yet — add a stocking trip first.</p>
          )}
          {state.items.map((it) => (
            <Card key={it.id} className="flex items-center justify-between gap-sm">
              <div className="min-w-0">
                <p className="truncate font-semibold text-on-surface">{it.name}</p>
                <p className="text-xs text-on-surface-variant">
                  UGX {ugx(it.sell)} each · {it.stock} in stock
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => setPicked((p) => ({ ...p, [it.id]: Math.max(0, (p[it.id] ?? 0) - 1) }))}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-high text-primary"
                  aria-label={`Remove one ${it.name}`}
                >
                  <Icon name="remove" />
                </button>
                <span className="w-6 text-center font-bold">{picked[it.id] ?? 0}</span>
                <button
                  onClick={() =>
                    setPicked((p) => ({ ...p, [it.id]: Math.min(it.stock, (p[it.id] ?? 0) + 1) }))
                  }
                  disabled={(picked[it.id] ?? 0) >= it.stock}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-on-primary disabled:opacity-40"
                  aria-label={`Add one ${it.name}`}
                >
                  <Icon name="add" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex gap-sm">
          <div className="flex-grow">
            <Keypad onPress={press} />
          </div>
          <MicButton
            onResult={(t) => {
              const n = parseAmount(t);
              if (n > 0) setAmount(String(n));
            }}
          />
        </div>
      )}

      <Card className="space-y-sm">
        <Field label="Date of sale" type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span className="text-sm font-bold text-on-surface-variant">
            Credit sale (doesn&apos;t touch Cash at Hand)
          </span>
          <input
            type="checkbox"
            checked={credit}
            onChange={(e) => setCredit(e.target.checked)}
            className="h-6 w-6 shrink-0 accent-[#135230]"
          />
        </label>
        {credit && (
          <div className="grid gap-sm sm:grid-cols-2">
            <Field label="Student name" value={debtor.name} onChange={(e) => setDebtor({ ...debtor, name: e.target.value })} />
            <Field label="Class / section" value={debtor.klass} onChange={(e) => setDebtor({ ...debtor, klass: e.target.value })} />
          </div>
        )}
      </Card>

      <PrimaryButton tone="cta" onClick={handleSave} disabled={total <= 0}>
        <Icon name="check" /> Save sale
      </PrimaryButton>
      <Saved show={saved} onUndo={() => { if (!credit) undoLast(); setSaved(false); }} />
    </AppLayout>
  );
}
