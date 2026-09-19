import { createFileRoute, Link } from "@tanstack/react-router";
import React, { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Tour, useTour, type TourStep } from "@/components/Tour";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/components/Icon";
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

type Tile = { to: string; icon: string; label: string; params?: Record<string, string> };

const dailyActions: Tile[] = [
  { to: "/sale", icon: "point_of_sale", label: "Sale" },
  { to: "/stock", icon: "inventory_2", label: "Stock" },
  { to: "/expense", icon: "receipt_long", label: "Expense" },
  { to: "/debtors", icon: "group", label: "Credit" },
  { to: "/close-out", icon: "task_alt", label: "Close Day" },
  { to: "/report", icon: "bar_chart", label: "Reports" },
];

function Home() {
  const { state, cashAtHand, today } = useStore();
  const [hide, setHide] = useState(false);

  const { user } = useAuth();
  const goalPct = Math.max(
    0,
    Math.min(100, Math.round((cashAtHand / Math.max(1, state.savingsGoal)) * 100)),
  );
  const recent = [...state.txs].sort((a, b) => b.ts - a.ts).slice(0, 6);
  const expectedItemProfit = state.items.reduce((sum, item) => sum + item.qty * item.sell - item.buy, 0);
  const realizedItemProfit = state.items.reduce((sum, item) => sum + (item.realizedProfit ?? 0), 0);
  const tour = useTour("operator-home-v2", user?.id, true);
  const steps = React.useMemo(() => tourSteps(), []);


  const hero = (
    <div className="card p-0" data-tour="balance">
      <div className="relative px-md pb-md pt-8">
        <span className="absolute left-0 top-0 rounded-br-lg rounded-tl-lg bg-secondary-container px-3 py-1 text-[11px] font-bold text-on-secondary-container">
          Cash at Hand
        </span>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-on-surface-variant">{state.termName}</p>
            <p className="price-display truncate text-primary">
              {hide ? "UGX ••••••" : `UGX ${ugx(cashAtHand)}`}
            </p>
          </div>
          <button
            onClick={() => setHide((h) => !h)}
            aria-label={hide ? "Show balance" : "Hide balance"}
            data-tour="eye"
            className="shrink-0 rounded-full p-2 text-primary hover:bg-surface-high"
          >
            <Icon name={hide ? "visibility" : "visibility_off"} />
          </button>

        </div>

        {state.savingsGoal > 0 ? (
          <div className="mt-sm">
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-high">
              <div className="h-full rounded-full bg-secondary-container" style={{ width: `${goalPct}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-on-surface-variant">
              Term goal {goalPct}% · target UGX {ugx(state.savingsGoal)} by term end
            </p>
          </div>
        ) : null}

      </div>

      <div className="grid grid-cols-2 border-t border-outline-variant/50">
        <Link to="/close-out" data-tour="close-day" className="flex min-h-11 items-center justify-center gap-2 py-3 text-sm font-bold text-primary hover:bg-surface-low">
          <Icon name="task_alt" className="text-[20px]" /> Close Day
        </Link>
        <Link
          to="/report"
          data-tour="statements"
          className="flex min-h-11 items-center justify-center gap-2 border-l border-outline-variant/50 py-3 text-sm font-bold text-primary hover:bg-surface-low"
        >
          <Icon name="swap_vert" className="text-[20px]" /> Statements
        </Link>

      </div>
    </div>
  );

  return (
    <AppLayout title="SmartCanteen" hero={hero}>
      <Tour steps={steps} open={tour.open} onClose={tour.finish} />
      <section className="card grid grid-cols-2 divide-x divide-outline-variant/50 p-0">
        <div className="p-sm text-center">
          <p className="text-[10px] uppercase tracking-wide text-on-surface-variant">Expected Profit</p>
          <p className="font-bold text-on-surface">UGX {ugx(expectedItemProfit)}</p>
          <p className="mt-1 text-[10px] text-on-surface-variant">All stock bought this term</p>
        </div>
        <div className="p-sm text-center">
          <p className="text-[10px] uppercase tracking-wide text-on-surface-variant">Realized Profit</p>
          <p className="font-bold text-primary">UGX {ugx(realizedItemProfit)}</p>
          <p className="mt-1 text-[10px] text-on-surface-variant">Confirmed by stock checks</p>
        </div>
      </section>
      <button
        onClick={tour.restart}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-outline-variant text-sm font-bold text-primary"
      >
        <Icon name="tips_and_updates" className="text-[18px]" /> Show me around this app
      </button>
      <div className="flex items-end justify-between px-1">
        <h2 className="label-bold text-on-surface-variant">Daily actions</h2>
        <Link to="/settings" className="text-sm font-bold text-primary">More</Link>
      </div>
      <section data-tour="tiles" className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-sm">
        {dailyActions.map((t, i) => (
          <TileLink
            key={`${t.to}-${i}`}
            to={t.to}
            params={t.params ?? {}}
            data-tour={`tile-${t.label}`}
            className="card flex aspect-square flex-col items-center justify-center gap-1.5 p-2 text-center transition-transform active:scale-95 hover:bg-surface-low"
          >
            <Icon name={t.icon} className="text-[24px] text-primary sm:text-[26px]" />
            <span className="text-[11px] font-semibold leading-tight text-on-surface sm:text-xs">{t.label}</span>
          </TileLink>

        ))}
      </section>

      <section className="card grid grid-cols-3 p-md">
        {[
          { l: "Sales", v: today.sales, i: "trending_up", c: "text-primary" },
          { l: "Out", v: today.expenses, i: "trending_down", c: "text-tertiary" },
          { l: "Net", v: today.net, i: "account_balance_wallet", c: "text-primary" },
        ].map((s) => (
          <div key={s.l} className="flex flex-col items-center gap-1">
            <span className="flex items-center gap-1 text-xs uppercase tracking-wide text-on-surface-variant">
              <Icon name={s.i} className="text-[14px]" /> {s.l}
            </span>
            <span className={`font-bold ${s.c}`}>{shortUgx(s.v)}</span>
          </div>
        ))}
      </section>

      <section>
        <div className="mb-sm flex items-end justify-between px-1">
          <h2 className="label-bold text-on-surface-variant" data-tour="recent">Recent transactions</h2>
          <Link to="/history" data-tour="see-all" className="text-sm font-bold text-primary hover:underline">
            See all
          </Link>

        </div>
        <div className="card overflow-hidden p-0">
          {recent.map((t) => {
            const income = t.type === "sale" || t.type === "capital";
            return (
              <div
                key={t.id}
                className="flex items-center justify-between gap-2 border-b border-surface-variant p-sm last:border-0"
              >
                <div className="flex min-w-0 items-center gap-sm">
                  <span
                    className={`shrink-0 rounded-full p-2 ${income ? "bg-primary/10 text-primary" : "bg-tertiary/10 text-tertiary"}`}
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
                <span className={`shrink-0 font-bold ${income ? "text-primary" : "text-tertiary"}`}>
                  {income ? "+" : "-"}
                  {ugx(t.amount)}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </AppLayout>
  );
}

const tourSteps = (): TourStep[] => [
  {
    id: "tile-Sale",
    title: "Record a sale",
    body: "Use Sale whenever a customer pays. Cash at Hand updates immediately.",
  },
  {
    id: "tile-Stock",
    title: "Add and count stock",
    body: "Use Stock to record purchases, quantities, buying costs and physical counts.",
  },
  {
    id: "tile-Expense",
    title: "Record money spent",
    body: "Use Expense for transport, wages, rent and every other business cost.",
  },
  {
    id: "tile-Credit",
    title: "Track unpaid sales",
    body: "Use Credit when goods leave before payment, then record each payment received.",
  },
  {
    id: "tile-Close Day",
    title: "Check the day’s cash",
    body: "At day end, count the cash box and compare it with the amount in SmartCanteen.",
  },
  {
    id: "tile-Reports",
    title: "Review the cash book",
    body: "Use Reports for sales, costs, stock profit and exports for the selected period.",
  },
];


/** Tiles link to both static and dynamic routes, so params are passed loosely. */
const TileLink = Link as unknown as React.ComponentType<Record<string, unknown>>;
