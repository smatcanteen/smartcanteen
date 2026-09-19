import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Icon } from "@/components/Icon";
import { Card, Field, PrimaryButton, SectionTitle } from "@/components/ui-kit";
import { DataTable, RangeBar, useRange } from "@/components/RangeExport";
import type { Sheet } from "@/lib/export";
import { dateInput, fromDateInput, ugx, useStore, type StockItem } from "@/lib/store";

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
  const { state, checkStock, setRunningLow } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<CheckForm>(blankForm);
  const checked = state.items.filter((i) => i.lastKnownQuantity != null);
  const atCost = checked.reduce(
    (a, i) => a + (i.qty ? (i.buy / i.qty) * (i.lastKnownQuantity ?? 0) : 0),
    0,
  );
  const atRetail = checked.reduce((a, i) => a + i.sell * (i.lastKnownQuantity ?? 0), 0);
  const low = state.items.filter((i) => i.runningLow);
  const range = useRange(state.termStartedAt);
  const purchases = state.txs
    .filter((t) => t.type === "stock" && range.has(t.ts))
    .sort((a, b) => b.ts - a.ts);
  const purchaseRows = purchases.map((t) => [
    new Date(t.ts).toLocaleDateString("en-GB"),
    t.label.replace(/\s+restock$/i, ""),
    t.units ?? "—",
    t.amount,
  ]);
  const stockSheet: Sheet = {
    name: "Stock purchases",
    columns: ["Date", "Item", "Quantity", "Cost (UGX)"],
    rows: purchaseRows,
    summary: [["Period", range.label], ["Total stocked", `UGX ${ugx(purchases.reduce((a, t) => a + t.amount, 0))}`]],
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
      <RangeBar range={range} title={`Stock purchases — ${range.label}`} sheets={[stockSheet]} baseName="smartcanteen-stock" />

      <Card className="space-y-sm overflow-hidden">
        <SectionTitle>Daily stock purchases</SectionTitle>
        <DataTable columns={["Date", "Item", "Quantity", "Cost (UGX)"]} rows={purchaseRows} pageSize={8} />
      </Card>

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
        <SectionTitle>Items this term</SectionTitle>
        <div className="space-y-sm">
          {state.items.map((item) => {
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
              <Card key={item.id} className="space-y-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-on-surface">{item.name}</p>
                  <div className="flex flex-wrap gap-2">
                    {item.runningLow && (
                      <span className="rounded-full bg-tertiary/10 px-3 py-1 text-xs font-bold text-tertiary">
                        Running Low
                      </span>
                    )}
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                      {isChecked ? `${item.lastKnownQuantity} left` : "In Stock"}
                    </span>
                  </div>
                </div>

                {isChecked && item.lastCheckedAt ? (
                  <p className="text-xs text-on-surface-variant">
                    Last checked {new Date(item.lastCheckedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                ) : (
                  <p className="text-xs text-on-surface-variant">Quantity not yet checked.</p>
                )}

                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <Stat label="Unit cost" value={`UGX ${ugx(unitCost)}`} />
                  <Stat label="Profit / unit" value={`UGX ${ugx(item.sell - unitCost)}`} />
                  <Stat label="Expected Profit" value={`UGX ${ugx(expectedProfit)}`} />
                  <Stat label="Realized Profit" value={`UGX ${ugx(item.realizedProfit ?? 0)}`} accent />
                </div>

                {!isEditing ? (
                  <div className="grid grid-cols-2 gap-2 border-t border-outline-variant/50 pt-sm">
                    <button
                      onClick={() => setRunningLow(item.id, !item.runningLow)}
                      className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-outline-variant px-3 text-sm font-bold text-tertiary hover:bg-surface-low"
                    >
                      <Icon name={item.runningLow ? "remove_circle" : "warning"} className="text-[18px]" />
                      {item.runningLow ? "Clear Low Flag" : "Running Low"}
                    </button>
                    <button
                      onClick={() => openCheck(item)}
                      className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-bold text-on-primary"
                    >
                      <Icon name="inventory" className="text-[18px]" /> Update Stock
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
              </Card>
            );
          })}
        </div>
      </section>

      <Link
        to="/stock-in"
        className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary font-bold text-on-primary shadow-raised"
      >
        <Icon name="add" /> New stocking trip
      </Link>
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
