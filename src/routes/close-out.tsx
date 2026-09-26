import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Icon } from "@/components/Icon";
import { Card, Field, PrimaryButton, SectionTitle } from "@/components/ui-kit";
import { buildDayDigest, closeStreak, dayKeyOf, openWhatsApp } from "@/lib/operator-helpers";
import { ugx, useStore } from "@/lib/store";
import { Link } from "@tanstack/react-router";

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
  const { state, today, cashAtHand, closeDay, setDigestPhone } = useStore();
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [digest, setDigest] = useState(true);
  const [phone, setPhone] = useState(state.digestPhone ?? "");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [streakAfter, setStreakAfter] = useState(0);

  const counted = notes.reduce((a, n) => a + n * (Number(counts[n]) || 0), 0);
  const diff = counted - cashAtHand;
  const todays = state.txs.filter(
    (t) => new Date(t.ts).toDateString() === new Date().toDateString(),
  );
  const todayKey = dayKeyOf();
  const already = (state.dayCloses ?? []).find((c) => c.dayKey === todayKey);

  const finish = () => {
    if (counted <= 0 && todays.length === 0) {
      setError("Count the cash in the till, or log today's sales first.");
      return;
    }
    setError("");
    if (phone.trim()) setDigestPhone(phone.trim());

    const digestText = buildDayDigest({
      termName: state.termName || "Canteen",
      sales: today.sales,
      expenses: today.expenses,
      net: today.net,
      expected: cashAtHand,
      counted,
      diff,
      dayKey: todayKey,
    });

    let digestSent = false;
    if (digest) {
      openWhatsApp(digestText, phone.trim() || undefined);
      digestSent = true;
    }

    closeDay({
      counted,
      expected: cashAtHand,
      sales: today.sales,
      expenses: today.expenses,
      net: today.net,
      digestSent,
    });
    // Streak includes today once the close is written; +1 covers the just-saved day
    // before React re-reads state.
    const prior = closeStreak(state.dayCloses);
    const hadToday = (state.dayCloses ?? []).some((c) => c.dayKey === todayKey);
    setStreakAfter(hadToday ? Math.max(prior, 1) : prior + 1);
    setDone(true);
  };

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

      {already && !done && (
        <Card className="bg-primary/10 text-sm text-primary">
          Day already closed at{" "}
          {new Date(already.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.
          Closing again replaces that record.
        </Card>
      )}

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

      <Card className="space-y-sm">
        <label className="flex items-center justify-between">
          <span className="text-sm font-bold text-on-surface-variant">Send WhatsApp daily digest</span>
          <input
            type="checkbox"
            checked={digest}
            onChange={(e) => setDigest(e.target.checked)}
            className="h-6 w-6 accent-[#135230]"
          />
        </label>
        {digest && (
          <>
            <Field
              label="WhatsApp number (optional)"
              inputMode="tel"
              placeholder="07xx… or leave blank to choose in WhatsApp"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              hint="Opens WhatsApp with today's sales, outgoings and till count ready to send."
            />
          </>
        )}
      </Card>

      {error ? <p className="text-sm font-semibold text-tertiary">{error}</p> : null}

      {done ? (
        <Card className="space-y-3 bg-primary/10 text-primary">
          <p className="font-bold text-lg">Day closed. Well done.</p>
          <p className="text-sm text-on-surface">
            Counted UGX {ugx(counted)} · app UGX {ugx(cashAtHand)} ·{" "}
            {diff === 0 ? "till balanced" : diff > 0 ? `surplus UGX ${ugx(diff)}` : `short UGX ${ugx(Math.abs(diff))}`}.
          </p>
          {streakAfter > 0 && (
            <p className="flex items-center gap-2 text-sm font-bold">
              <Icon name="local_fire_department" className="text-[20px]" />
              {streakAfter} day{streakAfter === 1 ? "" : "s"} closed in a row
              {streakAfter >= 7 ? " — full week!" : streakAfter >= 3 ? " — keep it going" : ""}
            </p>
          )}
          {digest ? <p className="text-sm text-on-surface">WhatsApp opened with your daily digest.</p> : null}
          <Link
            to="/"
            className="flex min-h-12 items-center justify-center rounded-md bg-primary text-sm font-bold text-on-primary"
          >
            Back to Home
          </Link>
        </Card>
      ) : (
        <PrimaryButton onClick={finish}>
          <Icon name="task_alt" /> Close the day
        </PrimaryButton>
      )}

      {(state.dayCloses ?? []).length > 0 && (
        <section>
          <SectionTitle>Recent closes</SectionTitle>
          <Card className="space-y-2 p-sm">
            {[...(state.dayCloses ?? [])]
              .slice(-5)
              .reverse()
              .map((c) => (
                <div key={c.id} className="flex justify-between text-sm">
                  <span>
                    {c.dayKey}
                    {c.digestSent ? " · WhatsApp" : ""}
                  </span>
                  <span className={c.diff === 0 ? "text-primary" : "text-tertiary"}>
                    {c.diff === 0 ? "OK" : c.diff > 0 ? `+${ugx(c.diff)}` : `−${ugx(Math.abs(c.diff))}`}
                  </span>
                </div>
              ))}
          </Card>
        </section>
      )}
    </AppLayout>
  );
}
