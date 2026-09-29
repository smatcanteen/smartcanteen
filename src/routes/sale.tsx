import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout, Saved } from "@/components/AppLayout";
import { Icon } from "@/components/Icon";
import { Card, Field, Keypad, MicButton, PrimaryButton, SectionTitle } from "@/components/ui-kit";
import { DataTable, RangeBar, useRange } from "@/components/RangeExport";
import type { Sheet } from "@/lib/export";
import { parseAmount } from "@/lib/voice";
import { parseVoiceDrafts, type VoiceDraft } from "@/lib/operator-helpers";
import { useDraft } from "@/lib/draft";
import { dateInput, fromDateInput, ugx, useStore } from "@/lib/store";
import { checkSales } from "@/lib/sales-check";

export const Route = createFileRoute("/sale")({
  head: () => ({
    meta: [
      { title: "Cash Sale — SmartCanteen" },
      {
        name: "description",
        content: "Record a cash sale in seconds with the keypad. Built for busy canteen counters — amount in, done.",
      },
      { property: "og:title", content: "Cash Sale — SmartCanteen" },
      { property: "og:description", content: "Fast keypad sale entry that updates Cash at Hand." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Sale,
});

type SaleDraft = {
  amount: string;
  credit: boolean;
  when: string;
  debtor: { name: string; klass: string };
  note: string;
};

function Sale() {
  const { state, addTx, addDebtor, undoLast, cashAtHand, addStockItems, editTx, deleteTx } = useStore();
  const [voiceDrafts, setVoiceDrafts] = useState<VoiceDraft[] | null>(null);
  /** Sale waiting for 'is this several days?' answer. */
  const [bigAsk, setBigAsk] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editWhen, setEditWhen] = useState("");
  // Work in progress stays on the device until the sale is saved.
  const draft = useDraft<SaleDraft>("sale-v2", {
    amount: "",
    credit: false,
    when: dateInput(Date.now()),
    debtor: { name: "", klass: "" },
    note: "",
  });
  const { amount, credit, when, debtor, note } = draft.value;
  const patch = (p: Partial<SaleDraft>) => draft.setValue((v) => ({ ...v, ...p }));
  const setAmount = (fn: string | ((a: string) => string)) =>
    draft.setValue((v) => ({ ...v, amount: typeof fn === "function" ? fn(v.amount) : fn }));
  const [saved, setSaved] = useState(false);
  const [lastLabel, setLastLabel] = useState("");
  /** Advanced options (credit, date, note) stay collapsed — one tap path first. */
  const [more, setMore] = useState(false);

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
    summary: [
      ["Period", range.label],
      ["Total sold", `UGX ${ugx(selectedTotal)}`],
      ["Previous period", `UGX ${ugx(previousTotal)}`],
    ],
  };

  const total = Number(amount) || 0;

  const todayKey = dateInput(Date.now());
  const isToday = when === todayKey;
  const whenLabel = isToday
    ? "Today"
    : new Date(fromDateInput(when)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

  // Usual day = average of days that already have sales (this term).
  const usual = checkSales(state.txs.filter((t) => t.type === "sale")).avgDay;
  const dayAlready = state.txs
    .filter((t) => t.type === "sale" && dateInput(t.ts) === when)
    .reduce((a, t) => a + t.amount, 0);
  const looksBig = !credit && usual > 0 && total > usual * 2.5;

  const recent = state.txs
    .filter((t) => t.type === "sale" && t.ts >= Date.now() - 7 * 86_400_000 - 12 * 3_600_000)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 12);
  const editing = recent.find((t) => t.id === editId);

  const press = (k: string) =>
    setAmount((a) => (k === "back" ? a.slice(0, -1) : (a + k).replace(/^0+(?=\d)/, "")));

  const handleSave = (skipAsk = false) => {
    if (total <= 0) return;
    if (looksBig && !skipAsk) {
      setBigAsk(true);
      return;
    }
    setBigAsk(false);
    const ts = fromDateInput(when);
    const label = note.trim() || "Cash sale";
    if (credit) {
      addDebtor({
        name: debtor.name.trim() || "Unnamed student",
        klass: debtor.klass.trim(),
        item: label,
        qty: 1,
        amount: total,
        ts,
      });
      setLastLabel(`Credit · ${debtor.name.trim() || "student"} · UGX ${ugx(total)}`);
    } else {
      addTx({ type: "sale", label, amount: total, ts });
      setLastLabel(`${label} · UGX ${ugx(total)}`);
    }
    draft.clearDraft();
    draft.setValue((v) => ({
      ...v,
      amount: "",
      note: "",
      credit: false,
      debtor: { name: "", klass: "" },
      when: dateInput(Date.now()),
    }));
    setSaved(true);
    setTimeout(() => setSaved(false), 5000);
  };

  return (
    <AppLayout title="Cash Sale" back>
      {/* Big amount first — canteen counter speed */}
      <Card className="text-center">
        <p className="label-bold text-on-surface-variant">Amount received</p>
        <p className="price-display mt-1 text-primary">UGX {ugx(total)}</p>
        <p className="mt-1 text-xs text-on-surface-variant">
          {credit
            ? "Credit — Cash at Hand stays the same until they pay"
            : `Cash at Hand becomes UGX ${ugx(cashAtHand + total)}`}
        </p>
      </Card>

      <label className="flex min-h-12 items-center justify-between gap-3 rounded-md bg-surface-lowest px-sm">
        <span className="text-sm font-bold text-on-surface-variant">Sale date</span>
        <span className="flex items-center gap-2">
          <span className={`text-sm font-bold ${isToday ? "text-primary" : "text-tertiary"}`}>{whenLabel}</span>
          <input
            type="date"
            aria-label="Pick another day for this sale"
            value={when}
            max={todayKey}
            onChange={(e) => patch({ when: e.target.value || todayKey })}
            className="min-h-9 rounded-md border border-outline-variant bg-surface px-2 text-sm"
          />
        </span>
      </label>
      {!isToday ? (
        <p className="text-xs text-tertiary">
          This sale will be saved on {whenLabel}, not today. {dayAlready > 0 ? `That day already has UGX ${ugx(dayAlready)}.` : ""}
        </p>
      ) : null}

      <div className="flex gap-sm">
        <div className="flex-grow">
          <Keypad onPress={press} />
        </div>
        <MicButton
          onResult={(t) => {
            const drafts = parseVoiceDrafts(t, state.expenseCategories, state.items);
            if (drafts.length > 1 || drafts.some((d) => d.kind !== "sale")) {
              setVoiceDrafts(drafts.length ? drafts : null);
              return;
            }
            const n = drafts[0]?.kind === "sale" ? drafts[0].amount : parseAmount(t);
            if (n > 0) setAmount(String(n));
          }}
        />
      </div>

      <button
        type="button"
        onClick={() => setMore((m) => !m)}
        className="flex min-h-11 w-full items-center justify-center gap-1 text-sm font-bold text-primary"
      >
        {more ? "Hide options" : "Credit · note · date"}
        <Icon name={more ? "expand_less" : "expand_more"} className="text-[18px]" />
      </button>

      {more && (
        <Card className="space-y-sm">
          <Field
            label="Note (optional)"
            placeholder="e.g. Break rush…"
            value={note}
            onChange={(e) => patch({ note: e.target.value })}
          />
          <Field
            label="Date of sale"
            type="date"
            value={when}
            onChange={(e) => patch({ when: e.target.value })}
          />
          <label className="flex min-h-11 items-center justify-between gap-3">
            <span className="text-sm font-bold text-on-surface-variant">
              Student credit (pays later)
              <span className="mt-0.5 block text-xs font-normal text-on-surface-variant">
                Does not touch money in hand until they pay
              </span>
            </span>
            <input
              type="checkbox"
              checked={credit}
              onChange={(e) => patch({ credit: e.target.checked })}
              className="h-6 w-6 shrink-0 accent-[#135230]"
            />
          </label>
          {credit && (
            <div className="grid gap-sm sm:grid-cols-2">
              <Field
                label="Student name"
                value={debtor.name}
                onChange={(e) => patch({ debtor: { ...debtor, name: e.target.value } })}
              />
              <Field
                label="Class"
                value={debtor.klass}
                onChange={(e) => patch({ debtor: { ...debtor, klass: e.target.value } })}
              />
            </div>
          )}
        </Card>
      )}

      <p className="text-xs leading-4 text-on-surface-variant">
        Shelf is updated under <span className="font-bold text-on-surface">Stock → Update</span>, not each sale.
      </p>

      {voiceDrafts && voiceDrafts.length > 0 && (
        <Card className="space-y-sm border border-primary/30">
          <SectionTitle>Confirm what you said</SectionTitle>
          <p className="text-xs text-on-surface-variant">Nothing is saved until you confirm.</p>
          {voiceDrafts.map((d, i) => (
            <div key={i} className="rounded-md bg-surface-low p-sm text-sm">
              {d.kind === "sale" && (
                <p>
                  Sale · UGX {ugx(d.amount)}{" "}
                  <span className="text-xs text-outline">“{d.raw}”</span>
                </p>
              )}
              {d.kind === "expense" && (
                <p>
                  Expense · {d.category ?? "Miscellaneous"} · UGX {ugx(d.amount)}
                </p>
              )}
              {d.kind === "stock" && (
                <p>
                  Stock · {d.name} ×{d.qty} · cost UGX {ugx(d.buy)}
                </p>
              )}
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setVoiceDrafts(null)}
              className="min-h-11 rounded-md border border-outline-variant font-bold"
            >
              Cancel
            </button>
            <PrimaryButton
              onClick={() => {
                for (const d of voiceDrafts) {
                  if (d.kind === "sale" && d.amount > 0)
                    addTx({ type: "sale", label: "Cash sale", amount: d.amount });
                  if (d.kind === "expense" && d.amount > 0)
                    addTx({
                      type: "expense",
                      label: d.category ?? "Expense",
                      category: d.category,
                      amount: d.amount,
                    });
                  if (d.kind === "stock" && d.qty > 0)
                    addStockItems([{ name: d.name, qty: d.qty, buy: d.buy, sell: d.sell || 0 }]);
                }
                setVoiceDrafts(null);
                setLastLabel("Voice entries saved");
                setSaved(true);
                setTimeout(() => setSaved(false), 5000);
              }}
            >
              Confirm & save
            </PrimaryButton>
          </div>
        </Card>
      )}

      <PrimaryButton tone="cta" onClick={() => handleSave()} disabled={total <= 0 || (credit && !debtor.name.trim())}>
        <Icon name="check" /> {credit ? "Save credit" : "Save sale"}
      </PrimaryButton>

      {bigAsk ? (
        <Card className="space-y-sm border-2 border-tertiary/50 bg-tertiary/5">
          <p className="font-bold text-tertiary">UGX {ugx(total)} is much bigger than a usual day (about UGX {ugx(usual)}).</p>
          <p className="text-sm text-on-surface">
            Is this several days added together? Saving each day on its own date keeps your reports and daily totals right.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setBigAsk(false);
                setMore(true);
              }}
              className="min-h-12 rounded-md border-2 border-primary font-bold text-primary"
            >
              No, go back and split by day
            </button>
            <PrimaryButton onClick={() => handleSave(true)}>Yes it is one day, save</PrimaryButton>
          </div>
        </Card>
      ) : null}
      <Saved
        show={saved}
        onUndo={() => {
          if (!credit) undoLast();
          setSaved(false);
        }}
      />
      {saved && lastLabel ? (
        <p className="text-center text-xs text-on-surface-variant">Saved: {lastLabel}. Undo for a few seconds if wrong.</p>
      ) : null}

      <Card className="space-y-sm">
        <SectionTitle>Recent sales · last 7 days</SectionTitle>
        <p className="text-xs text-on-surface-variant">Wrong amount or wrong day? Fix it here. Cash at Hand moves by the difference.</p>
        {recent.length === 0 ? <p className="text-sm text-outline">No sales in the last 7 days.</p> : null}
        {recent.map((t) => (
          <div key={t.id} className="rounded-md bg-surface-lowest p-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-on-surface">UGX {ugx(t.amount)}</p>
                <p className="truncate text-xs text-on-surface-variant">
                  {new Date(t.ts).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · {t.label}
                  {t.edits?.length ? " · edited" : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditId(editId === t.id ? null : t.id);
                    setEditAmount(String(t.amount));
                    setEditWhen(dateInput(t.ts));
                  }}
                  className="flex min-h-10 items-center gap-1 rounded-md bg-primary/10 px-3 text-xs font-bold text-primary"
                >
                  <Icon name="edit" className="text-[16px]" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const day = new Date(t.ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
                    if (
                      confirm(
                        `Delete UGX ${ugx(t.amount)} sale of ${day}?\n\nCash at Hand goes down by UGX ${ugx(t.amount)}. This cannot be brought back.`,
                      )
                    ) {
                      deleteTx(t.id);
                      if (editId === t.id) setEditId(null);
                    }
                  }}
                  className="flex min-h-10 items-center gap-1 rounded-md bg-error-container px-3 text-xs font-bold text-on-error-container"
                >
                  <Icon name="delete" className="text-[16px]" /> Delete
                </button>
              </div>
            </div>
            {editing && editing.id === t.id ? (
              <div className="mt-2 grid gap-sm sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <Field
                  label="Amount (UGX)"
                  inputMode="numeric"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value.replace(/\D/g, ""))}
                />
                <Field label="Date" type="date" value={editWhen} max={todayKey} onChange={(e) => setEditWhen(e.target.value)} />
                <PrimaryButton
                  onClick={() => {
                    const amt = Number(editAmount) || 0;
                    if (amt <= 0) return;
                    editTx(t.id, { amount: amt, ts: fromDateInput(editWhen || dateInput(t.ts)) });
                    setEditId(null);
                  }}
                >
                  Save fix
                </PrimaryButton>
              </div>
            ) : null}
          </div>
        ))}
        <Link to="/history" className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-primary underline">
          Older entries: open Fix entries
        </Link>
      </Card>

      <RangeBar range={range} title={`Sales report — ${range.label}`} sheets={[salesSheet]} baseName="smartcanteen-sales" />
      <Card className="space-y-sm">
        <SectionTitle>Sales by day</SectionTitle>
        <p className={`text-sm font-bold ${difference >= 0 ? "text-primary" : "text-tertiary"}`}>
          {difference >= 0 ? "↑" : "↓"} {difference >= 0 ? "Up" : "Down"} {Math.abs(change).toFixed(0)}% from the
          preceding period · {difference >= 0 ? "+" : "−"}UGX {ugx(Math.abs(difference))}
        </p>
        <DataTable columns={["Date", "Total sold (UGX)"]} rows={daily} pageSize={7} empty="No sales in this period." />
      </Card>
    </AppLayout>
  );
}
