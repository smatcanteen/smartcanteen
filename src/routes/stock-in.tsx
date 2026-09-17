import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout, Saved } from "@/components/AppLayout";
import { Icon } from "@/components/Icon";
import { Card, Field, MicButton, PrimaryButton, SelectField } from "@/components/ui-kit";
import { parseStock } from "@/lib/voice";
import { useDraft } from "@/lib/draft";
import { dateInput, fromDateInput, ugx, useStore } from "@/lib/store";

export const Route = createFileRoute("/stock-in")({
  head: () => ({
    meta: [
      { title: "Buy Stock — SmartCanteen" },
      { name: "description", content: "Log a restocking trip: package size, quantity, buying price, selling price and live expected profit." },
      { property: "og:title", content: "Buy Stock — SmartCanteen" },
      { property: "og:description", content: "Roomy line-item stock entry with package sizes, dates and live expected profit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StockIn,
});

type Line = { name: string; qty: string; buy: string; sell: string; pack: string; unitsPerPack: string };
const blank: Line = { name: "", qty: "", buy: "", sell: "", pack: "Piece", unitsPerPack: "1" };

const packs = [
  { label: "Piece (sold as ones)", units: 1 },
  { label: "Packet of 6", units: 6 },
  { label: "Box of 12", units: 12 },
  { label: "Crate of 24", units: 24 },
  { label: "Sack / bulk", units: 1 },
];

function StockIn() {
  const { state, addStockItems, cashAtHand } = useStore();
  // The trip is auto-saved as it is built, so an interruption loses nothing.
  const draft = useDraft<{ lines: Line[]; when: string }>("stock-in", {
    lines: [{ ...blank }],
    when: dateInput(Date.now()),
  });
  const lines = draft.value.lines;
  const when = draft.value.when;
  const setLines = (fn: (ls: Line[]) => Line[]) =>
    draft.setValue((v) => ({ ...v, lines: fn(v.lines) }));
  const setWhen = (v: string) => draft.setValue((prev) => ({ ...prev, when: v }));
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(0);
  const myItems = state.savedItems ?? [];

  const pickSaved = (id: string) => {
    const it = myItems.find((x) => x.id === id);
    if (!it) return;
    const line: Line = {
      name: it.name,
      qty: "",
      buy: "",
      sell: String(it.sell || ""),
      pack: it.pack ?? "Piece",
      unitsPerPack: String(it.unitsPerPack ?? 1),
    };
    setLines((ls) => {
      const empty = ls.findIndex((l) => !l.name.trim());
      if (empty >= 0) {
        setOpen(empty);
        return ls.map((l, i) => (i === empty ? line : l));
      }
      setOpen(ls.length);
      return [...ls, line];
    });
  };

  const parsed = lines.map((l) => {
    const packUnits = Number(l.unitsPerPack) || 1;
    const packQty = Number(l.qty) || 0;
    return {
      name: l.name.trim(),
      packQty,
      pack: l.pack,
      unitsPerPack: packUnits,
      qty: packQty * packUnits,
      buy: Number(l.buy) || 0,
      sell: Number(l.sell) || 0,
    };
  });
  const cost = parsed.reduce((a, l) => a + l.buy, 0);
  const revenue = parsed.reduce((a, l) => a + l.qty * l.sell, 0);
  const profit = revenue - cost;
  const valid = parsed.some((l) => l.name && l.qty > 0 && l.buy > 0);

  const update = (i: number, key: keyof Line, v: string) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [key]: v } : l)));

  const save = () => {
    addStockItems(
      parsed
        .filter((l) => l.name && l.qty > 0 && l.buy > 0)
        .map((l) => ({
          name: l.name,
          qty: l.qty,
          buy: l.buy,
          sell: l.sell,
          pack: l.pack,
          unitsPerPack: l.unitsPerPack,
          ts: fromDateInput(when),
        })),
    );
    setLines([{ ...blank }]);
    setSaved(true);
    setTimeout(() => setSaved(false), 4000);
  };

  return (
    <AppLayout title="Buy Stock" back>
      <Card className="flex flex-col gap-sm sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="label-bold text-on-surface-variant">Cash at Hand after this trip</p>
          <p className="price-display text-primary">UGX {ugx(cashAtHand - cost)}</p>
        </div>
        <div className="w-full sm:w-52">
          <Field label="Date of purchase" type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>
      </Card>

      <datalist id="known-items">
        {state.items.map((it) => (
          <option key={it.id} value={it.name} />
        ))}
      </datalist>

      <div className="space-y-sm">
        {lines.map((line, i) => {
          const p = parsed[i]!;
          const expanded = open === i;
          return (
            <Card key={i} className="space-y-sm">
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => setOpen(expanded ? -1 : i)}
                  aria-expanded={expanded}
                  className="flex min-w-0 flex-grow items-center gap-2 text-left"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold text-on-surface">
                      {p.name || "New item"}
                    </span>
                    <span className="block text-xs text-on-surface-variant">
                      {p.qty > 0 ? `${p.qty} units · UGX ${ugx(p.buy)}` : "Tap to fill in"}
                    </span>
                  </span>
                  <Icon name={expanded ? "expand_less" : "expand_more"} className="ml-auto text-on-surface-variant" />
                </button>
                {lines.length > 1 && (
                  <button
                    onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                    className="shrink-0 rounded-full p-2 text-tertiary hover:bg-surface-high"
                    aria-label={`Remove item ${i + 1}`}
                  >
                    <Icon name="delete" />
                  </button>
                )}
              </div>

              {expanded && (
                <div className="space-y-md border-t border-outline-variant/50 pt-sm">
                  <div className="flex items-start gap-sm">
                    <div className="flex-grow">
                      <Field
                        label="Item name"
                        list="known-items"
                        placeholder="e.g. Mandazi"
                        value={line.name}
                        onChange={(e) => {
                          const v = e.target.value;
                          update(i, "name", v);
                          const known = state.items.find((it) => it.name.toLowerCase() === v.toLowerCase());
                          if (known) update(i, "sell", String(known.sell));
                        }}
                        hint="Or say: “mandazi 200 pieces for 40000 selling at 500”"
                      />
                    </div>
                    <MicButton
                      onResult={(t) => {
                        const r = parseStock(t, state.items);
                        if (r.name) update(i, "name", r.name);
                        if (r.qty) update(i, "qty", String(r.qty));
                        if (r.buy) update(i, "buy", String(r.buy));
                        if (r.sell) update(i, "sell", String(r.sell));
                      }}
                    />
                  </div>

                  <div className="grid gap-sm sm:grid-cols-2">
                    <SelectField
                      label="Package size"
                      value={line.pack}
                      onChange={(e) => {
                        const pack = packs.find((x) => x.label === e.target.value);
                        update(i, "pack", e.target.value);
                        update(i, "unitsPerPack", String(pack?.units ?? 1));
                      }}
                    >
                      {packs.map((pk) => (
                        <option key={pk.label} value={pk.label}>
                          {pk.label}
                        </option>
                      ))}
                    </SelectField>
                    <Field
                      label="Units in one package"
                      inputMode="numeric"
                      value={line.unitsPerPack}
                      onChange={(e) => update(i, "unitsPerPack", e.target.value.replace(/\D/g, ""))}
                      hint="1 means the item is sold as ones"
                    />
                  </div>

                  <div className="grid gap-sm sm:grid-cols-3">
                    <Field
                      label="How many packages"
                      inputMode="numeric"
                      value={line.qty}
                      onChange={(e) => update(i, "qty", e.target.value.replace(/\D/g, ""))}
                      hint={p.qty > 0 ? `= ${p.qty} sellable units` : undefined}
                    />
                    <Field
                      label="Total buying price"
                      inputMode="numeric"
                      value={line.buy}
                      onChange={(e) => update(i, "buy", e.target.value.replace(/\D/g, ""))}
                      hint={p.qty ? `UGX ${ugx(p.buy / p.qty)} per unit` : undefined}
                    />
                    <Field
                      label="Selling price per unit"
                      inputMode="numeric"
                      value={line.sell}
                      onChange={(e) => update(i, "sell", e.target.value.replace(/\D/g, ""))}
                    />
                  </div>

                  <div className="rounded-md bg-surface-low p-sm text-sm">
                    Expected profit on this item:{" "}
                    <strong className={p.qty * p.sell - p.buy >= 0 ? "text-primary" : "text-tertiary"}>
                      UGX {ugx(p.qty * p.sell - p.buy)}
                    </strong>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <button
        onClick={() => {
          setLines((ls) => [...ls, { ...blank }]);
          setOpen(lines.length);
        }}
        className="flex h-12 min-h-12 w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-outline-variant font-bold text-primary hover:bg-surface-low"
      >
        <Icon name="add" /> Add another item
      </button>

      <Card className="space-y-2 bg-surface-low">
        <Row label="Total spent" value={`UGX ${ugx(cost)}`} />
        <Row label="Expected revenue" value={`UGX ${ugx(revenue)}`} />
        <Row label="Expected profit" value={`UGX ${ugx(profit)}`} strong />
      </Card>

      <PrimaryButton onClick={save} disabled={!valid}>
        <Icon name="check" /> Save stocking trip
      </PrimaryButton>
      <Saved show={saved} onUndo={() => setSaved(false)} />
    </AppLayout>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-on-surface-variant">{label}</span>
      <span className={strong ? "text-base font-bold text-primary" : "font-semibold"}>{value}</span>
    </div>
  );
}
