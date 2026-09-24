import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Icon } from "@/components/Icon";
import { Card, Field, PrimaryButton, SectionTitle } from "@/components/ui-kit";
import { DataTable, RangeBar, useRange } from "@/components/RangeExport";
import type { Sheet } from "@/lib/export";
import { dateInput, fromDateInput, ugx, useStore, type StockItem } from "@/lib/store";
import { StockPurchaseForm } from "./stock-in";

export const Route = createFileRoute("/stock")({
  head: () => ({
    meta: [
      { title: "Stock Checks & Item Profit — SmartCanteen" },
      { name: "description", content: "Confirm quantities on the shelf and see expected profit beside profit already realized." },
      { property: "og:title", content: "Stock Checks & Item Profit — SmartCanteen" },
      { property: "og:description", content: "Operator-confirmed stock levels, write-offs and realized profit by item." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Stock,
});

type CheckForm = {
  count: string;
  writtenOff: string;
  restockQty: string;
  restockCost: string;
  restockDate: string;
};

const blankForm = (): CheckForm => ({
  count: "",
  writtenOff: "0",
  restockQty: "",
  restockCost: "",
  restockDate: dateInput(Date.now()),
});

function Stock() {
  const { state, checkStock, setRunningLow, removeStockItem } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [form, setForm] = useState<CheckForm>(blankForm);
  const [itemSearch, setItemSearch] = useState("");
  const [itemPage, setItemPage] = useState(0);
  const [addingItem, setAddingItem] = useState(false);
  const [showPurchaseTables, setShowPurchaseTables] = useState(false);
  const checked = state.items.filter((i) => i.lastKnownQuantity != null);
  const atCost = checked.reduce(
    (a, i) => a + (i.qty ? (i.buy / i.qty) * (i.lastKnownQuantity ?? 0) : 0),
    0,
  );
  const atRetail = checked.reduce((a, i) => a + i.sell * (i.lastKnownQuantity ?? 0), 0);
  const low = state.items.filter((i) => i.runningLow);
  const filteredItems = state.items.filter((i) =>
    i.name.toLowerCase().includes(itemSearch.trim().toLowerCase()),
  );
  const itemPageSize = 6;
  const itemPages = Math.max(1, Math.ceil(filteredItems.length / itemPageSize));
  const currentItemPage = Math.min(itemPage, itemPages - 1);
  const visibleItems = filteredItems.slice(
    currentItemPage * itemPageSize,
    (currentItemPage + 1) * itemPageSize,
  );
  const range = useRange(state.termStartedAt);
  const purchases = state.txs
    .filter((t) => t.type === "stock" && range.has(t.ts))
    .sort((a, b) => b.ts - a.ts);
  const purchaseQuantity = (tx: (typeof purchases)[number]) =>
    tx.units != null ? { value: tx.units, recorded: true } : { value: "Not recorded", recorded: false };
  const purchaseRows = purchases.map((t) => {
    const quantity = purchaseQuantity(t);
    return [
      new Date(t.ts).toLocaleDateString("en-GB"),
      t.label.replace(/\s+restock$/i, ""),
      quantity.value,
      t.amount,
    ];
  });
  const purchaseSummary = Object.values(
    purchases.reduce<Record<string, { item: string; quantity: number; cost: number; incomplete: boolean }>>(
      (summary, tx) => {
        const item = state.items.find((i) => i.id === tx.itemId) ??
          state.items.find((i) => tx.label.toLowerCase().startsWith(i.name.toLowerCase()));
        const name = item?.name ?? tx.label.replace(/\s+restock$/i, "");
        const quantity = purchaseQuantity(tx);
        const key = name.toLowerCase();
        const row = summary[key] ?? { item: name, quantity: 0, cost: 0, incomplete: false };
        row.quantity += typeof quantity.value === "number" ? quantity.value : 0;
        row.cost += tx.amount;
        row.incomplete ||= !quantity.recorded;
        summary[key] = row;
        return summary;
      },
      {},
    ),
  ).sort((a, b) => b.cost - a.cost);
  const totalPurchaseQuantity = purchaseSummary.reduce((sum, row) => sum + row.quantity, 0);
  const totalPurchaseCost = purchaseSummary.reduce((sum, row) => sum + row.cost, 0);
  const purchaseSummaryRows = purchaseSummary.map((row) => [
    row.item,
    row.incomplete ? `${row.quantity} recorded + older quantity unavailable` : row.quantity,
    row.cost,
  ]);
  const stockSheet: Sheet = {
    name: "Stock purchases",
    columns: ["Date", "Item", "Quantity", "Cost (UGX)"],
    rows: purchaseRows,
    summary: [["Period", range.label], ["Recorded quantity bought", String(totalPurchaseQuantity)], ["Total purchase cost", `UGX ${ugx(totalPurchaseCost)}`]],
  };
  const stockSummarySheet: Sheet = {
    name: "Purchases by item",
    columns: ["Item", "Total quantity", "Total cost (UGX)"],
    rows: purchaseSummaryRows,
    summary: [["Period", range.label], ["Recorded quantity bought", String(totalPurchaseQuantity)], ["Total purchase cost", `UGX ${ugx(totalPurchaseCost)}`]],
  };

  const openCheck = (item: StockItem) => {
    setEditing(item.id);
    setForm({ ...blankForm(), count: String(item.lastKnownQuantity ?? item.qty) });
  };

  const saveCheck = (item: StockItem) => {
    const count = Number(form.count);
    const writtenOff = Number(form.writtenOff || 0);
    const restockQty = Number(form.restockQty || 0);
    const restockCost = Number(form.restockCost || 0);
    const previous = item.lastKnownQuantity ?? item.qty;
    const accountedFor = previous - count;
    const validRestock = restockQty > 0 && restockCost > 0;
    if (!Number.isFinite(count) || count < 0 || count > previous) return;
    if (!Number.isFinite(writtenOff) || writtenOff < 0 || writtenOff > accountedFor) return;
    if ((restockQty > 0 || restockCost > 0) && !validRestock) return;
    checkStock(
      item.id,
      count,
      writtenOff,
      validRestock
        ? { quantity: restockQty, cost: restockCost, date: fromDateInput(form.restockDate) }
        : undefined,
    );
    setEditing(null);
    setForm(blankForm());
  };

  return (
    <AppLayout title="Stock">
      <RangeBar range={range} title={`Stock purchases — ${range.label}`} sheets={[stockSheet, stockSummarySheet]} baseName="smartcanteen-stock" />

      <button
        onClick={() => setAddingItem((open) => !open)}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary font-bold text-on-primary shadow-raised"
        aria-expanded={addingItem}
      >
        <Icon name={addingItem ? "close" : "add"} /> {addingItem ? "Close purchase form" : "Add item"}
      </button>

      {addingItem && (
        <section className="space-y-sm rounded-lg border border-outline-variant bg-surface-lowest p-sm">
          <div>
            <SectionTitle>Add purchased stock</SectionTitle>
            <p className="text-sm text-on-surface-variant">Enter the total quantity bought, its cost, and the selling price per unit.</p>
          </div>
          <StockPurchaseForm onSaved={() => setAddingItem(false)} />
        </section>
      )}

      <Card className="space-y-2 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="label-bold text-on-surface">Purchase totals</p>
            <p className="text-xs text-on-surface-variant">{range.label}</p>
          </div>
          <div className="text-right text-sm">
            <p><strong>{totalPurchaseQuantity}</strong> recorded units</p>
            <p className="font-bold text-primary">UGX {ugx(totalPurchaseCost)}</p>
          </div>
        </div>
        <button
          onClick={() => setShowPurchaseTables((show) => !show)}
          className="flex min-h-10 w-full items-center justify-center gap-1 rounded-md border border-outline-variant text-sm font-bold text-primary"
          aria-expanded={showPurchaseTables}
        >
          {showPurchaseTables ? "Hide purchase tables" : "View purchase tables"}
          <Icon name={showPurchaseTables ? "expand_less" : "expand_more"} />
        </button>
      </Card>

      {showPurchaseTables && (
        <div className="space-y-sm">
          <Card className="space-y-sm overflow-hidden p-3 sm:p-4">
            <SectionTitle>Purchases by item</SectionTitle>
            <DataTable
              columns={["Item", "Total quantity", "Total cost (UGX)"]}
              rows={purchaseSummaryRows}
              pageSize={8}
              empty="No stock purchases in this period."
            />
          </Card>

          <Card className="space-y-sm overflow-hidden p-3 sm:p-4">
            <SectionTitle>Purchase entries</SectionTitle>
            <DataTable columns={["Date", "Item", "Quantity", "Cost (UGX)"]} rows={purchaseRows} pageSize={8} />
            {purchases.some((t) => !purchaseQuantity(t).recorded) && (
              <p className="text-xs text-on-surface-variant">
                Older purchases without a saved quantity show “Not recorded.” They are excluded from quantity totals but remain included in cost totals.
              </p>
            )}
          </Card>
        </div>
      )}

      <div className="grid gap-sm sm:grid-cols-2">
        <Card>
          <p className="label-bold text-on-surface-variant">Total Stocked · checked at cost</p>
          <p className="price-display text-on-surface">UGX {ugx(atCost)}</p>
          <p className="mt-1 text-xs text-on-surface-variant">Only items physically checked are included.</p>
        </Card>
        <Card>
          <p className="label-bold text-on-surface-variant">Total Stocked · checked at retail</p>
          <p className="price-display text-primary">UGX {ugx(atRetail)}</p>
          <p className="mt-1 text-xs text-on-surface-variant">Based on the latest confirmed count.</p>
        </Card>
      </div>

      {low.length > 0 && (
        <div className="rounded-lg border border-tertiary/20 bg-tertiary/10 p-sm">
          <p className="label-bold flex items-center gap-2 text-tertiary">
            <Icon name="warning" className="text-[18px]" /> Running low
          </p>
          <p className="mt-1 text-sm text-on-surface">{low.map((i) => i.name).join(", ")}</p>
        </div>
      )}

      <section>
        <div className="mb-sm flex items-end justify-between gap-2">
          <SectionTitle>Items this term</SectionTitle>
          <label className="w-40 max-w-[55%] text-xs font-bold text-on-surface-variant sm:w-48">
            Find item
            <input
              value={itemSearch}
              onChange={(e) => {
                setItemSearch(e.target.value);
                setItemPage(0);
              }}
              placeholder="Type item name"
              className="mt-1 h-10 w-full rounded-md border border-outline-variant bg-surface-lowest px-3 text-sm text-on-surface outline-none focus:border-primary"
            />
          </label>
        </div>
        <div className="space-y-sm">
          {visibleItems.map((item) => {
            const unitCost = item.qty ? item.buy / item.qty : 0;
            const expectedProfit = item.qty * item.sell - item.buy;
            const isChecked = item.lastKnownQuantity != null;
            const isEditing = editing === item.id;
            const previous = item.lastKnownQuantity ?? item.qty;
            const count = Number(form.count || 0);
            const accountedFor = Math.max(0, previous - count);
            const writtenOff = Number(form.writtenOff || 0);
            const sold = Math.max(0, accountedFor - writtenOff);
            const profitAdded = sold * (item.sell - unitCost);
            const invalid =
              !Number.isFinite(count) ||
              count < 0 ||
              count > previous ||
              writtenOff < 0 ||
              writtenOff > accountedFor ||
              ((Number(form.restockQty || 0) > 0 || Number(form.restockCost || 0) > 0) &&
                !(Number(form.restockQty) > 0 && Number(form.restockCost) > 0));

            return (
              <Card key={item.id} className="space-y-2 p-3 sm:space-y-sm sm:p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-on-surface">{item.name}</p>
                    <p className="text-xs text-on-surface-variant">{item.qty} bought · {isChecked ? `${item.lastKnownQuantity} left` : "count not checked"}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    {item.runningLow && (
                      <span className="rounded-full bg-tertiary/10 px-2 py-1 text-[11px] font-bold text-tertiary">
                        Running Low
                      </span>
                    )}
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary">
                      {isChecked ? `${item.lastKnownQuantity} left` : "Not checked"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-md bg-surface-low p-2 text-sm">
                  <Stat label="Expected profit" value={`UGX ${ugx(expectedProfit)}`} />
                  <Stat label="Realized profit" value={`UGX ${ugx(item.realizedProfit ?? 0)}`} accent />
                </div>

                <button
                  onClick={() => setDetails(details === item.id ? null : item.id)}
                  className="flex min-h-9 w-full items-center justify-center gap-1 text-xs font-bold text-primary"
                  aria-expanded={details === item.id}
                >
                  {details === item.id ? "Hide details" : "View cost and count details"}
                  <Icon name={details === item.id ? "expand_less" : "expand_more"} className="text-base" />
                </button>

                {details === item.id && (
                  <div className="space-y-2 rounded-md border border-outline-variant/60 p-2">
                    <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                      <Stat label="Total bought" value={`${item.qty} units`} />
                      <Stat label="Latest count" value={isChecked ? `${item.lastKnownQuantity} units` : "Not checked"} accent={isChecked} />
                      <Stat label="Unit cost" value={`UGX ${ugx(unitCost)}`} />
                      <Stat label="Profit / unit" value={`UGX ${ugx(item.sell - unitCost)}`} />
                    </div>
                    <p className="text-xs text-on-surface-variant">
                      {isChecked && item.lastCheckedAt
                        ? `Last checked ${new Date(item.lastCheckedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`
                        : "Tap Update Stock to confirm what is physically left."}
                    </p>
                  </div>
                )}

                {!isEditing ? (
                  <div className="grid grid-cols-3 gap-2 border-t border-outline-variant/50 pt-2">
                    <button
                      onClick={() => setRunningLow(item.id, !item.runningLow)}
                      className="flex min-h-11 items-center justify-center gap-1 rounded-md border border-outline-variant px-2 text-xs font-bold text-tertiary hover:bg-surface-low"
                    >
                      <Icon name={item.runningLow ? "remove_circle" : "warning"} className="text-[18px]" />
                      {item.runningLow ? "Clear Low Flag" : "Running Low"}
                    </button>
                    <button
                      onClick={() => openCheck(item)}
                      className="flex min-h-11 items-center justify-center gap-1 rounded-md bg-primary px-2 text-xs font-bold text-on-primary"
                    >
                      <Icon name="inventory" className="text-[18px]" /> Update
                    </button>
                    <button
                      onClick={() => setConfirmDelete(item.id)}
                      className="flex min-h-11 items-center justify-center gap-1 rounded-md border border-tertiary/40 px-2 text-xs font-bold text-tertiary hover:bg-tertiary/10"
                    >
                      <Icon name="delete" className="text-[18px]" /> Delete
                    </button>
                  </div>
                ) : (
                  <div className="space-y-sm border-t border-outline-variant/50 pt-sm">
                    <Field
                      label="How many are left right now?"
                      inputMode="numeric"
                      min="0"
                      max={previous}
                      value={form.count}
                      onChange={(e) => setForm((f) => ({ ...f, count: e.target.value.replace(/\D/g, "") }))}
                      hint={`Enter 0 if fully out. The previous known quantity is ${previous}.`}
                    />
                    <Field
                      label="Any of these gone but not sold?"
                      inputMode="numeric"
                      min="0"
                      max={accountedFor}
                      value={form.writtenOff}
                      onChange={(e) => setForm((f) => ({ ...f, writtenOff: e.target.value.replace(/\D/g, "") }))}
                      hint="Spoilage or items given away. Leave 0 if none."
                    />

                    <div className="rounded-md bg-surface-low p-sm text-sm text-on-surface">
                      {sold} confirmed sold · Realized Profit added: <strong className="text-primary">UGX {ugx(profitAdded)}</strong>
                    </div>

                    <div className="space-y-sm rounded-md border border-outline-variant/60 p-sm">
                      <p className="label-bold text-on-surface">Restocking now? <span className="font-normal text-on-surface-variant">Optional</span></p>
                      <div className="grid gap-sm sm:grid-cols-3">
                        <Field
                          label="New quantity"
                          inputMode="numeric"
                          value={form.restockQty}
                          onChange={(e) => setForm((f) => ({ ...f, restockQty: e.target.value.replace(/\D/g, "") }))}
                        />
                        <Field
                          label="Buying price"
                          inputMode="numeric"
                          value={form.restockCost}
                          onChange={(e) => setForm((f) => ({ ...f, restockCost: e.target.value.replace(/\D/g, "") }))}
                        />
                        <Field
                          label="Purchase date"
                          type="date"
                          value={form.restockDate}
                          onChange={(e) => setForm((f) => ({ ...f, restockDate: e.target.value }))}
                        />
                      </div>
                    </div>

                    {invalid && (
                      <p className="text-sm font-semibold text-tertiary">
                        The count cannot exceed {previous}; write-offs cannot exceed depleted units; restocks need both quantity and buying price.
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setEditing(null)}
                        className="min-h-12 rounded-md border border-outline-variant font-bold text-on-surface"
                      >
                        Cancel
                      </button>
                      <PrimaryButton onClick={() => saveCheck(item)} disabled={invalid}>
                        <Icon name="check" /> Save Check
                      </PrimaryButton>
                    </div>
                  </div>
                )}

                {confirmDelete === item.id && (
                  <div className="space-y-2 rounded-md border border-tertiary/40 bg-tertiary/10 p-3">
                    <p className="text-sm font-bold text-on-surface">Delete {item.name} from the current Stock list?</p>
                    <p className="text-xs text-on-surface-variant">Past purchase entries and stock checks will remain in reports.</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="min-h-11 rounded-md border border-outline-variant bg-surface-lowest text-sm font-bold text-on-surface"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          removeStockItem(item.id);
                          setConfirmDelete(null);
                          setDetails(null);
                        }}
                        className="min-h-11 rounded-md bg-tertiary text-sm font-bold text-on-tertiary"
                      >
                        Yes, delete item
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
          {visibleItems.length === 0 && (
            <Card><p className="text-sm text-on-surface-variant">No item matches “{itemSearch}”.</p></Card>
          )}
        </div>
        {itemPages > 1 && (
          <div className="mt-sm flex items-center justify-between rounded-md bg-surface-low px-3 py-2 text-sm">
            <button
              onClick={() => setItemPage((p) => Math.max(0, p - 1))}
              disabled={currentItemPage === 0}
              className="font-bold text-primary disabled:opacity-40"
            >
              Back
            </button>
            <span className="text-on-surface-variant">Page {currentItemPage + 1} of {itemPages}</span>
            <button
              onClick={() => setItemPage((p) => Math.min(itemPages - 1, p + 1))}
              disabled={currentItemPage >= itemPages - 1}
              className="font-bold text-primary disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </section>

    </AppLayout>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-outline">{label}</p>
      <p className={`font-bold ${accent ? "text-primary" : "text-on-surface"}`}>{value}</p>
    </div>
  );
}
