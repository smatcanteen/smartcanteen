import { createFileRoute, Link } from "@tanstack/react-router";
import React, { useEffect, useRef, useState } from "react";
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

const tabs: { id: string; label: string; tiles: Tile[] }[] = [
  {
    id: "for-you",
    label: "FOR YOU",
    tiles: [
      { to: "/sale", icon: "point_of_sale", label: "Cash Sale" },
      { to: "/stock-in", icon: "shopping_cart", label: "Buy Stock" },
      { to: "/expense", icon: "receipt_long", label: "Expense" },
      { to: "/debtors", icon: "group", label: "Credit Book" },
      { to: "/close-out", icon: "task_alt", label: "Close Day" },
      { to: "/report", icon: "bar_chart", label: "Reports" },
    ],
  },
  {
    id: "money-in",
    label: "MONEY IN",
    tiles: [
      { to: "/sale", icon: "payments", label: "Cash Sale" },
      { to: "/sale", icon: "sell", label: "Sell Item" },
      { to: "/debtors", icon: "handshake", label: "Collect Debt" },
      { to: "/term-capital", icon: "savings", label: "Add Capital" },
    ],
  },
  {
    id: "money-out",
    label: "MONEY OUT",
    tiles: [
      { to: "/stock-in", icon: "shopping_cart", label: "Buy Stock" },
      { to: "/pay/$category", params: { category: "transport" }, icon: "local_taxi", label: "Transport" },
      { to: "/pay/$category", params: { category: "salary-wages" }, icon: "badge", label: "Salary" },
      { to: "/pay/$category", params: { category: "rent" }, icon: "home_work", label: "Rent" },
      { to: "/pay/$category", params: { category: "airtime" }, icon: "smartphone", label: "Airtime" },
      { to: "/pay/$category", params: { category: "data" }, icon: "wifi", label: "Data" },
      { to: "/expense", icon: "more_horiz", label: "Other Expense" },
      { to: "/subscription", icon: "card_membership", label: "Subscription" },
    ],
  },
  {
    id: "manage",
    label: "MANAGE",
    tiles: [
      { to: "/stock", icon: "inventory", label: "Stock List" },
      { to: "/history", icon: "history", label: "Past Terms" },
      { to: "/term-capital", icon: "account_balance", label: "Term Capital" },
      { to: "/term-transition", icon: "event_repeat", label: "Close Term" },
      { to: "/subscription", icon: "card_membership", label: "Subscription" },
      { to: "/support", icon: "support_agent", label: "Help & Feedback" },
      { to: "/settings", icon: "settings", label: "Settings" },
    ],
  },
];

const TAB_KEY = "smartcanteen.tab";

function Home() {
  const { state, cashAtHand, today } = useStore();
  const [tab, setTab] = useState(tabs[0]!.id);
  const [hide, setHide] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);

  // Keep the tab the operator was on across refreshes.
  useEffect(() => {
    const saved = localStorage.getItem(TAB_KEY);
    if (saved && tabs.some((t) => t.id === saved)) setTab(saved);
  }, []);
  useEffect(() => {
    localStorage.setItem(TAB_KEY, tab);
  }, [tab]);

  const index = tabs.findIndex((t) => t.id === tab);
  const go = (dir: 1 | -1) => {
    const next = tabs[Math.min(tabs.length - 1, Math.max(0, index + dir))];
    if (next) setTab(next.id);
  };

  const { user } = useAuth();
  const goalPct = Math.max(
    0,
    Math.min(100, Math.round((cashAtHand / Math.max(1, state.savingsGoal)) * 100)),
  );
  const recent = [...state.txs].sort((a, b) => b.ts - a.ts).slice(0, 6);
  const expectedItemProfit = state.items.reduce((sum, item) => sum + item.qty * item.sell - item.buy, 0);
  const realizedItemProfit = state.items.reduce((sum, item) => sum + (item.realizedProfit ?? 0), 0);
  const active = tabs[index]!;

  const tour = useTour("operator-home", user?.id, true);
  const steps = React.useMemo(() => tourSteps(setTab), []);


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
      <div className="-mx-3 overflow-x-auto px-3 sm:-mx-4 sm:px-4 md:mx-0 md:px-0">
        <div role="tablist" aria-label="Shortcuts" data-tour="tabs" className="flex min-w-max gap-1 border-b border-outline-variant/50">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === tab}
              onClick={() => setTab(t.id)}
              className={`relative min-h-11 px-3 pb-2 pt-1 text-xs font-bold tracking-wide transition-colors sm:text-sm ${
                t.id === tab ? "text-primary" : "text-on-surface-variant"
              }`}
            >
              {t.label}
              {t.id === tab ? (
                <span className="absolute inset-x-2 -bottom-px h-1 rounded-full bg-secondary-container" />
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <section
        data-tour="tiles"
        className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-sm lg:grid-cols-6"
        onTouchStart={(e) => {
          const t = e.touches[0]!;
          touch.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          const start = touch.current;
          const t = e.changedTouches[0];
          if (!start || !t) return;
          const dx = t.clientX - start.x;
          const dy = t.clientY - start.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
          touch.current = null;
        }}
      >
        {active.tiles.map((t, i) => (
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
      <p className="-mt-2 text-center text-[11px] text-on-surface-variant md:hidden">
        Swipe left or right to change section
      </p>

      <section className="flex items-start gap-sm rounded-lg border border-secondary-container/40 bg-secondary-fixed/40 p-sm">
        <Icon name="lightbulb" className="text-secondary" />
        <div>
          <p className="label-bold text-on-secondary-container">Simple Insight</p>
          <p className="text-sm text-on-surface">
            Transport is your fastest-growing expense this term. Consider one bulk trip a week.
          </p>
        </div>
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

/**
 * Button-by-button walkthrough: what each button does, how to use it and what
 * the operator gains from it. Steps that live on another section switch to it
 * first, so every button is actually pointed at.
 */
const tourSteps = (setTab: (id: string) => void): TourStep[] => {
  const on = (id: string) => () => setTab(id);
  return [
    {
      id: "balance",
      title: "Cash at Hand card",
      body: "Read this first every morning. It is opening cash, plus sales, minus stock and expenses. Count the money in your box — if it matches this number, your book is correct and nothing is missing.",
    },
    {
      id: "eye",
      title: "The eye button",
      body: "Tap the eye to hide the amount when a customer is standing at the counter, and tap it again to show it. Your money stays private in a crowd.",
    },
    {
      id: "close-day",
      title: "Close Day button",
      body: "Tap this at the end of the day, count your cash and type what you actually have. It tells you at once whether you are short or over, so a mistake is caught the same day.",
    },
    {
      id: "statements",
      title: "Statements button",
      body: "Tap here for your money-in and money-out statement. Use it when the school office or a parent asks for proof — you can send it as Excel or PDF.",
    },
    {
      id: "tabs",
      title: "The four section buttons",
      body: "FOR YOU is your daily shortcuts, MONEY IN is anything you receive, MONEY OUT is anything you pay, MANAGE is stock, terms and settings. Tap a name or swipe left and right.",
      before: on("for-you"),
    },
    {
      id: "tile-Cash Sale",
      title: "Cash Sale button",
      body: "Tap it every time a student pays cash. Type the amount and it is added to your cash at hand instantly — no paper book, and your daily total is always ready.",
      before: on("for-you"),
    },
    {
      id: "tile-Buy Stock",
      title: "Buy Stock button",
      body: "Use it when you pay a supplier. Enter the item, the pack size and what you paid — the money leaves your cash at hand and the items appear on your shelf list.",
      before: on("for-you"),
    },
    {
      id: "tile-Expense",
      title: "Expense button",
      body: "For any other money going out: transport, airtime, repairs. Recording it keeps your profit honest instead of leaving unexplained gaps in the cash.",
      before: on("for-you"),
    },
    {
      id: "tile-Credit Book",
      title: "Credit Book button",
      body: "Tap it when someone takes goods without paying. You will always know who owes you, how much and since when, and you record the payment here when they clear it.",
      before: on("for-you"),
    },
    {
      id: "tile-Reports",
      title: "Reports button",
      body: "Your term profit, best sellers and biggest costs in one screen. Use it to decide what to stock more of and where to cut spending.",
      before: on("for-you"),
    },
    {
      id: "tile-Collect Debt",
      title: "Collect Debt button",
      body: "In MONEY IN, tap this when a student clears a debt. The amount joins your cash and their balance drops — no arguments about what is still owed.",
      before: on("money-in"),
    },
    {
      id: "tile-Add Capital",
      title: "Add Capital button",
      body: "Use it when the school or owner puts extra money into the canteen. It is counted as capital, not profit, so your real earnings stay accurate.",
      before: on("money-in"),
    },
    {
      id: "tile-Transport",
      title: "The money-out shortcuts",
      body: "In MONEY OUT each button is a ready-made category — transport, salary, rent, airtime, data. Tap one, type the amount, done, and your reports group the spending for you.",
      before: on("money-out"),
    },
    {
      id: "tile-Stock List",
      title: "Stock List button",
      body: "In MANAGE, this shows everything on your shelf and what it is worth. Check it before buying so you never pay twice for goods you already have.",
      before: on("manage"),
    },
    {
      id: "tile-Close Term",
      title: "Close Term button",
      body: "At the end of a term, tap this to bank the results and carry your cash and stock into the new term. Last term is saved for comparison instead of being lost.",
      before: on("manage"),
    },
    {
      id: "tile-Help & Feedback",
      title: "Help & Feedback button",
      body: "Stuck, or something looks wrong? Tap here to reach the SmartCanteen team directly and get an answer without leaving the app.",
      before: on("manage"),
    },
    {
      id: "tile-Settings",
      title: "Settings button",
      body: "Change your PIN, your canteen details and your backup here. Setting a PIN you remember keeps your money data safe if the phone is left on the counter.",
      before: on("manage"),
    },
    {
      id: "see-all",
      title: "See all button",
      body: "Opens your full history with search, past terms and Excel or PDF export. Use it to check an old day or to prove an entry.",
      before: on("for-you"),
    },
  ];
};


/** Tiles link to both static and dynamic routes, so params are passed loosely. */
const TileLink = Link as unknown as React.ComponentType<Record<string, unknown>>;
