import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Icon } from "@/components/Icon";
import { Card, Field, SectionTitle, SelectField } from "@/components/ui-kit";
import { GroupedBars, TrendLine } from "@/components/Charts";
import { exportCsv, exportExcel, exportPdf, type Sheet } from "@/lib/export";
import { dateInput, ugx, useStore, type Tx } from "@/lib/store";

const whenToTs = (when: string) => {
  const t = new Date(`${when}T12:00:00`).getTime();
  return Number.isFinite(t) ? t : Date.now();
};

export const Route = createFileRoute("/history")({
  validateSearch: (search: Record<string, unknown>) => ({
    edit: typeof search.edit === "string" ? search.edit : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Fix entries — SmartCanteen" },
      {
        name: "description",
        content:
          "Correct a wrong date, amount or first stock buy. Cash at Hand moves by the difference only.",
      },
      { property: "og:title", content: "Fix entries — SmartCanteen" },
      {
        property: "og:description",
        content: "Edit past sales, expenses and stock purchases — including dates and first item entries.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: History,
});

function History() {
  const { edit: openEditId } = Route.useSearch();
  const { state, totals, cashAtHand } = useStore();
  const [termId, setTermId] = useState("current");
  const [type, setType] = useState("all");
  const [category, setCategory] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const term = state.terms.find((t) => t.id === termId);
  const source: Tx[] = term ? term.txs : state.txs;
  const termLabel = term ? term.name : state.termName;

  const rows = useMemo(() => {
    const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
    const toTs = to ? new Date(`${to}T23:59:59`).getTime() : Infinity;
    return [...source]
      .filter((t) => (type === "all" ? true : t.type === type))
      .filter((t) => (category === "all" ? true : (t.category ?? "—") === category))
      .filter((t) => t.ts >= fromTs && t.ts <= toTs)
      .sort((a, b) => b.ts - a.ts);
  }, [source, type, category, from, to]);

  const sum = (k: string) => rows.filter((r) => r.type === k).reduce((a, r) => a + r.amount, 0);
  const sales = sum("sale");
  const stock = sum("stock");
  const expenses = sum("expense");
  const profit = sales - stock - expenses;
  const categories = Array.from(new Set(source.map((t) => t.category).filter(Boolean) as string[]));

  const sheet: Sheet = {
    name: "Transactions",
    columns: ["Date", "Type", "Description", "Category", "Amount (UGX)"],
    rows: rows.map((r) => [
      new Date(r.ts).toLocaleDateString("en-GB"),
      r.type,
      r.label,
      r.category ?? "",
      r.amount,
    ]),
    summary: [
      ["Term", termLabel],
      ["Sales", `UGX ${ugx(sales)}`],
      ["Stock purchases", `UGX ${ugx(stock)}`],
      ["Other expenses", `UGX ${ugx(expenses)}`],
      ["Net profit", `UGX ${ugx(profit)}`],
    ],
  };

  const termsSheet: Sheet = {
    name: "Term comparison",
    columns: ["Term", "Opening capital", "Target", "Sales", "Stock", "Expenses", "Profit"],
    rows: [
      ...state.terms.map((t) => [t.name, t.capital, t.target, t.sales, t.stockSpend, t.expenses, t.profit]),
      [
        `${state.termName} (running)`,
        state.capital,
        state.savingsGoal,
        totals.sales,
        totals.stock,
        totals.expenses,
        totals.sales - totals.stock - totals.expenses,
      ],
    ],
  };

  const base = `smartcanteen-${termLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  const compareSeries = [
    { key: "sales", label: "Sales", color: "var(--color-primary)" },
    { key: "stock", label: "Stock", color: "var(--color-secondary)" },
    { key: "expenses", label: "Expenses", color: "var(--color-tertiary)" },
    { key: "profit", label: "Profit", color: "var(--color-primary-container)" },
  ];
  const compareRows: { label: string; values: Record<string, number> }[] = [
    ...[...state.terms]
      .sort((a, b) => a.closedAt - b.closedAt)
      .map((t) => ({
        label: t.name,
        values: { sales: t.sales, stock: t.stockSpend, expenses: t.expenses, profit: t.profit },
      })),
    {
      label: `${state.termName} (now)`,
      values: {
        sales: totals.sales,
        stock: totals.stock,
        expenses: totals.expenses,
        profit: totals.sales - totals.stock - totals.expenses,
      },
    },
  ];

  return (
    <AppLayout title="Fix entries" back>
      <Card className="border border-primary/20 bg-primary/5 p-sm text-sm text-on-surface">
        <p className="font-bold text-primary">Made a mistake yesterday?</p>
        <p className="mt-1 text-xs leading-4 text-on-surface-variant">
          Tap the pencil on any line in the <span className="font-bold text-on-surface">running term</span>. You can
          change the <span className="font-bold text-on-surface">date</span>, amount, and for stock also quantity and
          selling price. Money in hand moves by the difference only.
        </p>
      </Card>

      <section className="space-y-sm">
        <SectionTitle>Term performance</SectionTitle>
        <div className="grid gap-sm sm:grid-cols-2">
          {[...state.terms]
            .sort((a, b) => b.closedAt - a.closedAt)
            .map((t) => (
              <Card key={t.id} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-on-surface">{t.name}</p>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                    closed {new Date(t.closedAt).toLocaleDateString("en-GB")}
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant">
                  Started with UGX {ugx(t.capital)} · target UGX {ugx(t.target)}
                </p>
                <div className="grid grid-cols-3 gap-2 pt-1 text-sm">
                  <Mini label="Sales" value={t.sales} />
                  <Mini label="Spent" value={t.stockSpend + t.expenses} />
                  <Mini label="Profit" value={t.profit} accent />
                </div>
              </Card>
            ))}
          <Card className="space-y-1 border-2 border-primary/30">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-on-surface">{state.termName}</p>
              <span className="rounded-full bg-secondary-container px-3 py-1 text-xs font-bold text-on-secondary-container">
                running
              </span>
            </div>
            <p className="text-sm text-on-surface-variant">
              Money in hand UGX {ugx(cashAtHand)} · target UGX {ugx(state.savingsGoal)}
            </p>
            <div className="grid grid-cols-3 gap-2 pt-1 text-sm">
              <Mini label="Sales" value={totals.sales} />
              <Mini label="Spent" value={totals.stock + totals.expenses} />
              <Mini label="Profit" value={totals.sales - totals.stock - totals.expenses} accent />
            </div>
          </Card>
        </div>
      </section>

      <Card className="space-y-md">
        <SectionTitle>Compare terms</SectionTitle>
        <GroupedBars rows={compareRows} series={compareSeries} />
        <div>
          <p className="mb-1 label-bold text-on-surface-variant">Profit trend</p>
          <TrendLine points={compareRows.map((r) => ({ label: r.label, value: r.values["profit"] ?? 0 }))} />
        </div>
      </Card>

      <Card className="space-y-sm">
        <SectionTitle>Find an entry</SectionTitle>
        <div className="grid gap-sm sm:grid-cols-2 lg:grid-cols-4">
          <SelectField label="Term" value={termId} onChange={(e) => setTermId(e.target.value)}>
            <option value="current">{state.termName} (running — can edit)</option>
            {state.terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} (closed — view only)
              </option>
            ))}
          </SelectField>
          <SelectField label="Type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All entries</option>
            <option value="sale">Sales</option>
            <option value="stock">Stock purchases</option>
            <option value="expense">Expenses</option>
            <option value="capital">Opening money</option>
          </SelectField>
          <SelectField label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectField>
          <div className="grid grid-cols-2 gap-2">
            <Field label="From" type="date" value={from} max={dateInput(Date.now())} onChange={(e) => setFrom(e.target.value)} />
            <Field label="To" type="date" value={to} max={dateInput(Date.now())} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-md bg-surface-low p-sm text-sm sm:grid-cols-4">
          <Mini label="Sales" value={sales} />
          <Mini label="Stock" value={stock} />
          <Mini label="Expenses" value={expenses} />
          <Mini label="Profit" value={profit} accent />
        </div>
        <div className="grid gap-sm sm:grid-cols-3">
          <ExportBtn icon="picture_as_pdf" label="PDF report" onClick={() => exportPdf(`${termLabel} report`, `${rows.length} entries`, [sheet, termsSheet])} />
          <ExportBtn icon="table_view" label="Excel (.xls)" onClick={() => exportExcel(base, [sheet, termsSheet], `SmartCanteen — ${termLabel}`)} />
          <ExportBtn icon="description" label="CSV" onClick={() => exportCsv(base, sheet)} />
        </div>
      </Card>

      <div className="mb-sm flex items-end justify-between px-1">
        <h2 className="label-bold text-on-surface-variant">Entries ({rows.length})</h2>
        {!term ? (
          <p className="text-xs font-bold text-primary">Tap ✎ to correct</p>
        ) : (
          <p className="text-xs text-on-surface-variant">Closed term — view only</p>
        )}
      </div>

      <div className="card overflow-hidden p-0">
        {rows.length === 0 && <p className="p-md text-sm text-on-surface-variant">No entries match these filters.</p>}
        {rows.map((t) => (
          <EntryRow key={t.id} tx={t} editable={!term} startOpen={openEditId === t.id} />
        ))}
      </div>
    </AppLayout>
  );
}

/** One cash-book line with full correction panel (date, amount, stock qty/price). */
function EntryRow({ tx, editable, startOpen }: { tx: Tx; editable: boolean; startOpen?: boolean }) {
  const { state, editTx, deleteTx } = useStore();
  const [open, setOpen] = useState(!!startOpen);
  const [amount, setAmount] = useState(String(tx.amount));
  const [label, setLabel] = useState(tx.label);
  const [category, setCategory] = useState(tx.category ?? "");
  const [when, setWhen] = useState(dateInput(tx.ts));
  const [units, setUnits] = useState(String(tx.units ?? ""));
  const [sell, setSell] = useState(String(tx.sell ?? ""));
  const [savedMsg, setSavedMsg] = useState("");
  const income = tx.type === "sale" || tx.type === "capital";

  useEffect(() => {
    if (startOpen) setOpen(true);
  }, [startOpen]);

  // Keep form in sync if the same row is re-opened after another edit.
  useEffect(() => {
    if (!open) return;
    setAmount(String(tx.amount));
    setLabel(tx.label);
    setCategory(tx.category ?? "");
    setWhen(dateInput(tx.ts));
    setUnits(String(tx.units ?? ""));
    setSell(String(tx.sell ?? ""));
  }, [open, tx.id, tx.amount, tx.label, tx.category, tx.ts, tx.units, tx.sell]);

  const apply = () => {
    const patch: Parameters<typeof editTx>[1] = {
      amount: Number(amount) || 0,
      label: label.trim() || tx.label,
      ts: whenToTs(when),
    };
    if (tx.type === "expense") patch.category = category;
    if (tx.type === "stock") {
      if (units !== "") patch.units = Number(units) || 0;
      if (sell !== "") patch.sell = Number(sell) || 0;
    }
    editTx(tx.id, patch);
    setSavedMsg("Saved. Money in hand updated by the difference.");
    setTimeout(() => setSavedMsg(""), 3500);
    setOpen(false);
  };

  const typeLabel =
    tx.type === "sale"
      ? "Sale"
      : tx.type === "stock"
        ? "Stock buy"
        : tx.type === "expense"
          ? "Expense"
          : "Opening money";

  return (
    <div id={`entry-${tx.id}`} className="border-b border-surface-variant last:border-0">
      <div className="flex items-center justify-between gap-2 p-sm">
        <div className="min-w-0">
          <p className="truncate font-semibold text-on-surface">{tx.label}</p>
          <p className="text-xs text-on-surface-variant">
            {new Date(tx.ts).toLocaleDateString("en-GB")} · {typeLabel}
            {tx.category ? ` · ${tx.category}` : ""}
            {tx.type === "stock" && tx.units != null ? ` · ${tx.units} units` : ""}
            {tx.edits?.length ? ` · fixed ${tx.edits.length}×` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className={`font-bold tabular-nums ${income ? "text-primary" : "text-tertiary"}`}>
            {income ? "+" : "-"}
            {ugx(tx.amount)}
          </span>
          {editable && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-label={`Fix ${tx.label}`}
              aria-expanded={open}
              className="flex h-11 w-11 items-center justify-center rounded-full text-primary hover:bg-surface-low"
            >
              <Icon name={open ? "close" : "edit"} />
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="space-y-sm bg-surface-low p-sm">
          <p className="text-xs font-bold text-on-surface-variant">Correct this {typeLabel.toLowerCase()}</p>
          <div className="grid gap-sm sm:grid-cols-2">
            <Field label="Description" value={label} onChange={(e) => setLabel(e.target.value)} />
            <Field
              label={tx.type === "stock" ? "Total cost paid (UGX)" : "Amount (UGX)"}
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
              hint="Money in hand moves by the difference only"
            />
            <Field
              label="Date of entry"
              type="date"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              hint="Change this if you logged it on the wrong day"
            />
            {tx.type === "expense" && (
              <SelectField label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
                {state.expenseCategories.map((c) => (
                  <option key={c.id} value={c.label}>
                    {c.label}
                  </option>
                ))}
              </SelectField>
            )}
            {tx.type === "stock" && (
              <>
                <Field
                  label="Quantity bought (units)"
                  inputMode="numeric"
                  value={units}
                  onChange={(e) => setUnits(e.target.value.replace(/\D/g, ""))}
                  hint="First stock buy or restock count"
                />
                <Field
                  label="Selling price per unit (UGX)"
                  inputMode="numeric"
                  value={sell}
                  onChange={(e) => setSell(e.target.value.replace(/\D/g, ""))}
                />
              </>
            )}
          </div>

          {tx.type === "stock" && (
            <p className="text-xs leading-4 text-on-surface-variant">
              Shelf stock and expected profit re-adjust by the difference. Use this for wrong first entries (wrong qty,
              cost, sell price or date).
            </p>
          )}
          {tx.type === "capital" && (
            <p className="text-xs leading-4 text-on-surface-variant">
              Opening money change moves Money in hand by the difference.
            </p>
          )}

          {!!tx.edits?.length && (
            <div className="rounded-md bg-surface p-sm text-xs text-on-surface-variant">
              <p className="mb-1 font-bold text-on-surface">Earlier corrections</p>
              {tx.edits.map((e, i) => (
                <p key={i}>
                  {new Date(e.at).toLocaleString("en-GB")} — {e.note}
                </p>
              ))}
            </div>
          )}

          {savedMsg ? <p className="text-sm font-semibold text-primary">{savedMsg}</p> : null}

          <div className="flex gap-sm">
            <button
              type="button"
              onClick={apply}
              className="flex h-12 min-h-12 flex-grow items-center justify-center gap-2 rounded-md bg-primary font-bold text-on-primary"
            >
              <Icon name="check" /> Save correction
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm("Delete this entry? Money and stock will reverse.")) deleteTx(tx.id);
              }}
              className="flex h-12 min-h-12 items-center justify-center gap-2 rounded-md bg-error-container px-4 font-bold text-on-error-container"
            >
              <Icon name="delete" /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Mini({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-on-surface-variant">{label}</p>
      <p className={`font-bold tabular-nums ${accent ? (value >= 0 ? "text-primary" : "text-tertiary") : "text-on-surface"}`}>
        {ugx(value)}
      </p>
    </div>
  );
}

function ExportBtn({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-12 min-h-12 items-center justify-center gap-2 rounded-md bg-primary font-bold text-on-primary hover:bg-primary-container"
    >
      <Icon name={icon} /> {label}
    </button>
  );
}
