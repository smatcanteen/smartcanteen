import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Icon } from "@/components/Icon";
import { Card, Field, PrimaryButton, SectionTitle } from "@/components/ui-kit";
import { ugx, useStore } from "@/lib/store";

export const Route = createFileRoute("/close-out")({
  head: () => ({
    meta: [
      { title: "End-of-Day Close-Out — SmartCanteen" },
      { name: "description", content: "A two-minute closing ritual: confirm sales, review expenses, count cash and see any mismatch." },
      { property: "og:title", content: "End-of-Day Close-Out — SmartCanteen" },
      { property: "og:description", content: "Reconcile the till against what the app expects, every evening." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CloseOut,
});

// Notes and coins, so the till can be balanced to the last 50 shillings.
const notes = [50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50];

function CloseOut() {
  const { state, today, cashAtHand } = useStore();
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [digest, setDigest] = useState(true);
  const [done, setDone] = useState(false);

  const counted = notes.reduce((a, n) => a + n * (Number(counts[n]) || 0), 0);
  const diff = counted - cashAtHand;
  const todays = state.txs.filter(
    (t) => new Date(t.ts).toDateString() === new Date().toDateString(),
  );

  return (
    <AppLayout title="Close-Out">
      <Card className="grid grid-cols-3 gap-sm text-center">
        <div>
          <p className="text-xs uppercase text-outline">Sales</p>
          <p className="font-bold text-primary">UGX {ugx(today.sales)}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-outline">Out</p>
          <p className="font-bold text-tertiary">UGX {ugx(today.expenses)}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-outline">Net</p>
          <p className="font-bold text-on-surface">UGX {ugx(today.net)}</p>
        </div>
      </Card>

      <section>
        <SectionTitle>Today's entries</SectionTitle>
        <Card className="space-y-2 p-sm">
          {todays.length === 0 && <p className="text-sm text-outline">No entries logged today yet.</p>}
          {todays.map((t) => (
            <div key={t.id} className="flex justify-between text-sm">
              <span className="text-on-surface">{t.label}</span>
              <span className={t.type === "sale" ? "font-bold text-primary" : "font-bold text-tertiary"}>
                {t.type === "sale" ? "+" : "-"}
                {ugx(t.amount)}
              </span>
            </div>
          ))}
        </Card>
      </section>

      <section>
        <SectionTitle>Count physical cash</SectionTitle>
        <div className="grid gap-sm grid-cols-2 lg:grid-cols-3">
          {notes.map((n) => (
            <Field
              key={n}
              label={`UGX ${ugx(n)} ${n >= 1000 ? "notes" : "coins"}`}
              inputMode="numeric"
              placeholder="0"
              value={counts[n] ?? ""}
              onChange={(e) => setCounts({ ...counts, [n]: e.target.value })}
            />
          ))}
        </div>
      </section>

      <Card className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-on-surface-variant">Counted</span>
          <span className="font-bold">UGX {ugx(counted)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-on-surface-variant">App expects</span>
          <span className="font-bold">UGX {ugx(cashAtHand)}</span>
        </div>
        <div
          className={`flex items-center justify-between rounded-md p-sm ${
            diff === 0 ? "bg-primary/10 text-primary" : "bg-error-container text-on-error-container"
          }`}
        >
          <span className="font-bold">{diff === 0 ? "Perfectly balanced" : diff > 0 ? "Surplus" : "Shortfall"}</span>
          <span className="font-bold">UGX {ugx(Math.abs(diff))}</span>
        </div>
      </Card>

      <Card>
        <label className="flex items-center justify-between">
          <span className="text-sm font-bold text-on-surface-variant">
            Send WhatsApp daily digest
          </span>
          <input
            type="checkbox"
            checked={digest}
            onChange={(e) => setDigest(e.target.checked)}
            className="h-6 w-6 accent-[#135230]"
          />
        </label>
      </Card>

      <PrimaryButton onClick={() => setDone(true)}>
        <Icon name="task_alt" /> {done ? "Day closed" : "Close the day"}
      </PrimaryButton>
    </AppLayout>
  );
}
