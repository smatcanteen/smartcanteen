import { createFileRoute, Link } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Tour, useTour, type TourStep } from "@/components/Tour";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/components/Icon";
import {
  balanceOf,
  buildInsights,
  closeForDay,
  closeStreak,
  collectTodayList,
  dayKeyOf,
  dayTotals,
  daysSinceStockCheck,
  eveningCloseMessage,
  localHour,
  lowStockItems,
  morningGreeting,
  needsEveningClose,
  needsWeeklyStockCheck,
  openTillMismatch,
  openWhatsApp,
  overdueDebtors,
  shelfQty,
  yesterdayKey,
} from "@/lib/operator-helpers";
import { ugx, shortUgx, useStore } from "@/lib/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SmartCanteen — Daily Cash Book for Canteen Operators" },
      {
        name: "description",
        content:
          "Track term capital, stock, sales and expenses in one place. SmartCanteen keeps your Cash at Hand always right.",
      },
      { property: "og:title", content: "SmartCanteen — Canteen Financial System" },
      {
        property: "og:description",
        content: "From opening capital to term-end profit: one connected cash book for canteen operators.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

/** Only the four daily moves — everything else lives under More / Reports. */
const dailyActions = [
  { to: "/sale", icon: "point_of_sale", label: "Sale" },
  { to: "/stock", icon: "inventory_2", label: "Stock" },
  { to: "/expense", icon: "receipt_long", label: "Expense" },
  { to: "/close-out", icon: "task_alt", label: "Close" },
] as const;

function Home() {
  const { state, cashAtHand, today, termProfit, logRecurringDue } = useStore();
  const [hide, setHide] = useState(false);
  const [hour, setHour] = useState(() => localHour());
  const { user } = useAuth();

  useEffect(() => {
    const id = window.setInterval(() => setHour(localHour()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const goalPct = Math.max(
    0,
    Math.min(100, Math.round((termProfit / Math.max(1, state.savingsGoal)) * 100)),
  );
  const recent = [...state.txs].sort((a, b) => b.ts - a.ts).slice(0, 5);
  const insights = buildInsights(state, termProfit);
  const overdue = overdueDebtors(state.debtors, 7);
  const collectList = collectTodayList(state.debtors, 3);
  const low = lowStockItems(state.items);
  const dueRecurring = (state.recurringExpenses ?? []).filter((r) => r.nextDue <= Date.now());
  const stockDue = needsWeeklyStockCheck(state.stockChecks, state.items, 7);
  const stockDays = daysSinceStockCheck(state.stockChecks, state.items);
  const tillMismatch = openTillMismatch(state.dayCloses);

  const todayKey = dayKeyOf();
  const yKey = yesterdayKey();
  const todayClose = closeForDay(state.dayCloses, todayKey);
  const yClose = closeForDay(state.dayCloses, yKey);
  const yTotals = dayTotals(state.txs, yKey);
  const missedYesterday = !yClose && yTotals.count > 0;
  const streak = closeStreak(state.dayCloses);
  const eveningDue = needsEveningClose(state.dayCloses);
  const morning = hour < 12;
  const openClean = today.sales === 0 && today.expenses === 0 && !todayClose;

  const tour = useTour("operator-home-v3", user?.id, true);
  const steps = React.useMemo(() => tourSteps(), []);

  const hero = (
    <div className="card p-0" data-tour="balance">
      <div className="relative px-md pb-md pt-8">
        <span className="absolute left-0 top-0 rounded-br-lg rounded-tl-lg bg-secondary-container px-3 py-1 text-[11px] font-bold text-on-secondary-container">
          Cash at Hand
        </span>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-on-surface-variant">
              {morningGreeting(hour)}
              {user?.name ? ` · ${user.name.split(" ")[0]}` : ""}
              {" · "}
              {state.termName}
            </p>
            <p className="price-display truncate text-primary">
              {hide ? "UGX ••••••" : `UGX ${ugx(cashAtHand)}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setHide((h) => !h)}
            aria-label={hide ? "Show balance" : "Hide balance"}
            data-tour="eye"
            className="shrink-0 rounded-full p-2 text-primary hover:bg-surface-high"
          >
            <Icon name={hide ? "visibility" : "visibility_off"} />
          </button>
        </div>

        <div className="mt-sm flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
              streak > 0
                ? "bg-primary/15 text-primary"
                : "bg-surface-high text-on-surface-variant"
            }`}
            data-tour="streak"
          >
            <Icon name="local_fire_department" className="text-[14px]" />
            {streak > 0
              ? `${streak} day${streak === 1 ? "" : "s"} closed in a row`
              : "Close today to start a streak"}
          </span>
          {todayClose && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
              <Icon name="check_circle" className="text-[14px]" /> Today closed
            </span>
          )}
        </div>

        {state.savingsGoal > 0 ? (
          <div className="mt-sm">
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-high">
              <div className="h-full rounded-full bg-secondary-container" style={{ width: `${goalPct}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-on-surface-variant">
              Savings goal {goalPct}% · net profit UGX {ugx(termProfit)} of UGX {ugx(state.savingsGoal)}
            </p>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 border-t border-outline-variant/50">
        <Link
          to="/sale"
          data-tour="quick-sale"
          className="flex min-h-12 items-center justify-center gap-2 bg-secondary-container/30 py-3 text-sm font-bold text-on-secondary-container hover:bg-secondary-container/50"
        >
          <Icon name="bolt" className="text-[20px]" /> Quick sale
        </Link>
        <Link
          to="/close-out"
          data-tour="close-day"
          className="flex min-h-12 items-center justify-center gap-2 border-l border-outline-variant/50 py-3 text-sm font-bold text-primary hover:bg-surface-low"
        >
          <Icon name="task_alt" className="text-[20px]" />
          {todayClose ? "Re-close day" : eveningDue ? "Close now" : "Close Day"}
        </Link>
      </div>
    </div>
  );

  return (
    <AppLayout title="SmartCanteen" hero={hero}>
      <Tour steps={steps} open={tour.open} onClose={tour.finish} />

      <section className="space-y-2" data-tour="habit">
        {missedYesterday && (
          <Link
            to="/close-out"
            className="card flex items-start gap-3 border border-tertiary/40 bg-tertiary/10 p-sm"
          >
            <Icon name="warning" className="mt-0.5 shrink-0 text-tertiary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-tertiary">Yesterday was not closed</p>
              <p className="text-xs leading-4 text-on-surface">
                {yTotals.count} entries · sales UGX {ugx(yTotals.sales)} · net UGX {ugx(yTotals.net)}.
                Close Day keeps your streak and the till honest.
              </p>
            </div>
            <span className="shrink-0 self-center text-xs font-bold text-primary">Close →</span>
          </Link>
        )}

        {!missedYesterday && yClose && morning && openClean && (
          <div className="card space-y-1 border border-primary/20 bg-primary/5 p-sm">
            <p className="text-sm font-bold text-primary">
              {morningGreeting(hour)} — till is ready
            </p>
            <p className="text-xs leading-4 text-on-surface-variant">
              Yesterday net UGX {ugx(yClose.net)}
              {yClose.diff === 0
                ? " · till balanced"
                : yClose.diff > 0
                  ? ` · surplus UGX ${ugx(yClose.diff)}`
                  : ` · short UGX ${ugx(Math.abs(yClose.diff))}`}
              . Tap <span className="font-bold text-on-surface">Quick sale</span> when the first customer pays.
            </p>
          </div>
        )}

        {eveningDue && (
          <div className="card space-y-2 border border-secondary/40 bg-secondary/10 p-sm">
            <div className="flex items-start gap-2">
              <Icon name="wb_twilight" className="mt-0.5 shrink-0 text-secondary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-secondary">Time to close the day</p>
                <p className="text-xs leading-4 text-on-surface">
                  Sales UGX {ugx(today.sales)} · net UGX {ugx(today.net)}. Count the till — about two minutes.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Link
                to="/close-out"
                className="flex min-h-11 items-center justify-center rounded-md bg-primary text-sm font-bold text-on-primary"
              >
                Close Day
              </Link>
              <button
                type="button"
                onClick={() =>
                  openWhatsApp(
                    eveningCloseMessage({
                      termName: state.termName || "Canteen",
                      sales: today.sales,
                      net: today.net,
                    }),
                    state.digestPhone,
                  )
                }
                className="flex min-h-11 items-center justify-center gap-1 rounded-md border border-outline-variant text-sm font-bold text-on-surface"
              >
                <Icon name="chat" className="text-[18px]" /> Remind me
              </button>
            </div>
          </div>
        )}

        {tillMismatch && (
          <Link
            to="/close-out"
            className="card block border border-tertiary/40 bg-tertiary/10 p-sm text-sm"
          >
            <span className="font-bold text-tertiary">
              Till {tillMismatch.diff > 0 ? "surplus" : "shortfall"} UGX {ugx(Math.abs(tillMismatch.diff))}
            </span>
            {" "}
            from {tillMismatch.dayKey} close — stays here until the next balanced close.
          </Link>
        )}

        {collectList.length > 0 && (
          <Link to="/debtors" className="card block border border-secondary/30 bg-secondary/10 p-sm text-sm">
            <span className="font-bold text-secondary">Collect today</span>
            {": "}
            {collectList
              .slice(0, 3)
              .map((d) => `${d.name} (UGX ${ugx(balanceOf(d))})`)
              .join(", ")}
            {collectList.length > 3 ? ` +${collectList.length - 3} more` : ""}
          </Link>
        )}

        {stockDue && (
          <Link to="/stock" className="card block border border-primary/25 bg-primary/5 p-sm text-sm">
            <span className="font-bold text-primary">Weekly shelf count due</span>
            {" · "}
            {stockDays === null
              ? "No physical count yet — count once so the book stays honest."
              : `Last count ${stockDays} day${stockDays === 1 ? "" : "s"} ago. Sales do not change shelf — you count.`}
          </Link>
        )}
      </section>

      {(dueRecurring.length > 0 || overdue.length > 0 || low.length > 0) && (
        <section className="space-y-2">
          {dueRecurring.map((r) => (
            <div
              key={r.id}
              className="card flex items-center justify-between gap-2 border border-secondary/30 bg-secondary/10 p-sm"
            >
              <p className="text-sm font-semibold text-on-surface">
                {r.category} due · UGX {ugx(r.amount)}
              </p>
              <button
                type="button"
                onClick={() => logRecurringDue(r.id)}
                className="min-h-10 shrink-0 rounded-md bg-primary px-3 text-xs font-bold text-on-primary"
              >
                Log now
              </button>
            </div>
          ))}
          {overdue.length > 0 && (
            <Link
              to="/debtors"
              className="card block border border-tertiary/30 bg-tertiary/10 p-sm text-sm text-on-surface"
            >
              <span className="font-bold text-tertiary">{overdue.length} credit unpaid 7+ days</span>
              {" · "}UGX {ugx(overdue.reduce((a, d) => a + balanceOf(d), 0))} still out — tap to collect
            </Link>
          )}
          {low.length > 0 && (
            <Link to="/stock" className="card block border border-tertiary/20 bg-tertiary/10 p-sm text-sm">
              <span className="font-bold text-tertiary">Restock list</span>
              {": "}
              {low
                .slice(0, 4)
                .map((i) => `${i.name} (${shelfQty(i)})`)
                .join(", ")}
              {low.length > 4 ? "…" : ""}
            </Link>
          )}
        </section>
      )}

      {insights.length > 0 && (
        <section className="space-y-2">
          {insights.slice(0, 2).map((tip, i) => (
            <div key={i} className="card flex gap-2 p-sm text-sm text-on-surface">
              <Icon name="tips_and_updates" className="shrink-0 text-primary" />
              <span>{tip}</span>
            </div>
          ))}
        </section>
      )}

      <section className="card grid grid-cols-3 p-md" data-tour="today">
        {[
          { l: "Sales", v: today.sales, i: "trending_up", c: "text-primary" },
          { l: "Out", v: today.expenses, i: "trending_down", c: "text-tertiary" },
          { l: "Net", v: today.net, i: "account_balance_wallet", c: "text-primary" },
        ].map((s) => (
          <div key={s.l} className="flex flex-col items-center gap-1">
            <span className="flex items-center gap-1 text-xs uppercase tracking-wide text-on-surface-variant">
              <Icon name={s.i} className="text-[14px]" /> {s.l}
            </span>
            <span className={`font-bold tabular-nums ${s.c}`}>{shortUgx(s.v)}</span>
          </div>
        ))}
      </section>

      <div className="flex items-end justify-between px-1">
        <h2 className="label-bold text-on-surface-variant">Daily actions</h2>
        <Link to="/settings" className="text-sm font-bold text-primary">
          More
        </Link>
      </div>
      <section data-tour="tiles" className="grid grid-cols-4 gap-2">
        {dailyActions.map((t) => (
          <TileLink
            key={t.to}
            to={t.to}
            data-tour={`tile-${t.label}`}
            className="card flex aspect-square flex-col items-center justify-center gap-1.5 p-2 text-center transition-transform active:scale-95 hover:bg-surface-low"
          >
            <Icon name={t.icon} className="text-[26px] text-primary" />
            <span className="text-[11px] font-semibold leading-tight text-on-surface">{t.label}</span>
          </TileLink>
        ))}
      </section>

      <section className="grid grid-cols-3 gap-2">
        <Link
          to="/debtors"
          className="card flex min-h-11 items-center justify-center gap-1 p-2 text-xs font-bold text-on-surface"
        >
          <Icon name="group" className="text-[16px] text-primary" /> Credit
        </Link>
        <Link
          to="/report"
          className="card flex min-h-11 items-center justify-center gap-1 p-2 text-xs font-bold text-on-surface"
        >
          <Icon name="bar_chart" className="text-[16px] text-primary" /> Reports
        </Link>
        <Link
          to="/history"
          className="card flex min-h-11 items-center justify-center gap-1 p-2 text-xs font-bold text-on-surface"
        >
          <Icon name="history" className="text-[16px] text-primary" /> History
        </Link>
      </section>

      <section>
        <div className="mb-sm flex items-end justify-between px-1">
          <h2 className="label-bold text-on-surface-variant" data-tour="recent">
            Recent
          </h2>
          <Link to="/history" data-tour="see-all" className="text-sm font-bold text-primary hover:underline">
            See all
          </Link>
        </div>
        <div className="card overflow-hidden p-0">
          {recent.length === 0 && (
            <p className="p-sm text-sm text-on-surface-variant">No entries yet today. Tap Quick sale to start.</p>
          )}
          {recent.map((t) => {
            const income = t.type === "sale" || t.type === "capital";
            return (
              <div
                key={t.id}
                className="flex items-center justify-between gap-2 border-b border-surface-variant p-sm last:border-0"
              >
                <div className="flex min-w-0 items-center gap-sm">
                  <span
                    className={`shrink-0 rounded-full p-2 ${
                      income ? "bg-primary/10 text-primary" : "bg-tertiary/10 text-tertiary"
                    }`}
                  >
                    <Icon
                      name={
                        t.type === "sale"
                          ? "payments"
                          : t.type === "stock"
                            ? "shopping_cart"
                            : t.type === "capital"
                              ? "savings"
                              : "receipt_long"
                      }
                    />
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold text-on-surface">{t.label}</span>
                    <span className="text-xs text-on-surface-variant">
                      {new Date(t.ts).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
                <span className={`shrink-0 font-bold tabular-nums ${income ? "text-primary" : "text-tertiary"}`}>
                  {income ? "+" : "-"}
                  {ugx(t.amount)}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <button
        type="button"
        onClick={tour.restart}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-dashed border-outline-variant text-sm font-bold text-on-surface-variant"
      >
        <Icon name="tips_and_updates" className="text-[18px]" /> Show me around
      </button>
    </AppLayout>
  );
}

const tourSteps = (): TourStep[] => [
  {
    id: "quick-sale",
    title: "Log money in seconds",
    body: "Quick sale opens the keypad. Use it every time a customer pays — like buying airtime.",
  },
  {
    id: "streak",
    title: "Keep your close streak",
    body: "Close the day every evening. The fire count grows when you don’t skip a day.",
  },
  {
    id: "close-day",
    title: "Count the till",
    body: "At day end, count cash and match the app. Two minutes keeps the book honest.",
  },
  {
    id: "tile-Sale",
    title: "Daily actions",
    body: "Sale, Stock, Expense, Close — the four moves you need most days. Everything else is under More.",
  },
];

const TileLink = Link as unknown as React.ComponentType<Record<string, unknown>>;
