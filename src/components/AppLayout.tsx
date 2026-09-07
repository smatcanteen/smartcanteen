import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Icon } from "./Icon";
import { AccountAvatar, BrandMark, useAccountLogo } from "./Brand";
import { homeForRole, useAuth } from "@/lib/auth";
import { usePlatform } from "@/lib/platform";
import { useStore } from "@/lib/store";



const bottomNav = [
  { to: "/", icon: "home", label: "Home" },
  { to: "/stock", icon: "inventory_2", label: "Stock" },
  { to: "/history", icon: "history", label: "History" },
  { to: "/settings", icon: "more_horiz", label: "More" },
] as const;

const topNav = [
  { to: "/", label: "Home" },
  { to: "/stock", label: "Stock" },
  { to: "/report", label: "Reports" },
  { to: "/history", label: "History" },
  { to: "/debtors", label: "Credit" },
  { to: "/close-out", label: "Close" },
  { to: "/subscription", label: "Plan" },
  { to: "/settings", label: "Settings" },
];

/** MoMo-style app shell: deep green top band, floating content, phone-first bottom bar. */
export function AppLayout({
  title,
  back,
  hero,
  children,
}: {
  title: string;
  back?: boolean;
  /** Optional card that floats over the green band (home screen balance card). */
  hero?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const path = router.state.location.pathname;
  const navigate = useNavigate();
  const { user, ready, logout } = useAuth();
  const { state, hydrated } = useStore();
  const { s: platform } = usePlatform();

  const banner = platform.announcements.find((a) => a.active);
  const { logo } = useAccountLogo(user?.id);


  // Operator screens are private: no session means back to the login page.
  useEffect(() => {
    if (!ready) return;
    if (!user) navigate({ to: "/login" });
    else if (user.role !== "operator") navigate({ to: homeForRole(user.role) });
    // Brand-new operators must set their own PIN and opening capital first.
    else if (user.otpPending) navigate({ to: "/first-run" });
    else if (hydrated && !state.setupDone) navigate({ to: "/canteen-setup" });
  }, [ready, user, navigate, hydrated, state.setupDone]);

  if (!ready || !hydrated) {
    return (
      <div className="flex min-h-screen flex-col bg-surface-high">
        <div className="h-28 bg-primary" />
        <div className="mx-auto -mt-10 w-full max-w-container-max space-y-sm px-3 sm:px-4">
          <div className="h-32 animate-pulse rounded-xl bg-surface-lowest" />
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-xl bg-surface-lowest" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!user || user.role !== "operator") return null;


  return (
    <div className="flex min-h-screen flex-col bg-surface-high">
      <div className={`bg-primary ${hero ? "pb-20" : "pb-6"}`}>
        <header className="mx-auto grid h-16 w-full max-w-container-max grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 sm:px-4 md:px-gutter">
          <div className="flex min-w-0 items-center gap-2">
            {back ? (
              <Link
                to="/"
                className="-ml-2 shrink-0 rounded-full p-2 text-on-primary/90 transition-colors hover:bg-on-primary/10"
                aria-label="Back to home"
              >
                <Icon name="arrow_back" />
              </Link>
            ) : logo ? (
              <AccountAvatar name={user.name} logo={logo} variant="dark" size="sm" />
            ) : (
              <BrandMark variant="dark" size="sm" />
            )}
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold text-on-primary sm:text-lg">{title}</h1>
              <p className="truncate text-[11px] text-on-primary/70 sm:hidden">{user.school || user.name}</p>
            </div>
          </div>

          <nav className="hidden items-center gap-1 lg:flex">
            {topNav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                preload="intent"
                className={`rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
                  path === n.to
                    ? "bg-on-primary text-primary"
                    : "text-on-primary/80 hover:bg-on-primary/10"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            <Link
              to="/support"
              className="rounded-full p-2 text-secondary-container transition-colors hover:bg-on-primary/10"
              aria-label="Help and feedback"
            >
              <Icon name="support_agent" />
            </Link>
            <Link
              to="/subscription"
              className="hidden rounded-full p-2 text-secondary-container transition-colors hover:bg-on-primary/10 sm:block"
              aria-label="Subscription"
            >
              <Icon name="card_membership" />
            </Link>
            <span className="hidden max-w-[140px] truncate text-xs font-semibold text-on-primary/80 md:block">
              {user.name}
            </span>
            <button
              onClick={() => {
                logout();
                navigate({ to: "/login" });
              }}
              className="rounded-full p-2 text-secondary-container transition-colors hover:bg-on-primary/10"
              aria-label="Log out"
            >
              <Icon name="logout" />
            </button>
          </div>
        </header>


        {banner ? (
          <div className="mx-auto w-full max-w-container-max px-3 pb-2 sm:px-4 md:px-gutter">
            <div className="rounded-md bg-on-primary/10 p-3">
              <p className="text-sm font-bold text-on-primary">{banner.title}</p>
              <p className="text-xs text-on-primary/80">{banner.body}</p>
            </div>
          </div>
        ) : null}

        {hero ? (
          <div className="mx-auto w-full max-w-container-max px-3 sm:px-4 md:px-gutter">{hero}</div>
        ) : null}
      </div>

      <main
        className={`mx-auto w-full max-w-container-max flex-grow space-y-sm rounded-t-2xl bg-surface-high px-3 pb-32 pt-md sm:space-y-md sm:px-4 md:px-gutter lg:pb-lg ${
          hero ? "-mt-14" : "-mt-3"
        }`}
      >
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 z-50 w-full border-t border-outline-variant/40 bg-surface-lowest pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="relative mx-auto grid w-full max-w-[560px] grid-cols-5 items-end px-2 pb-2 pt-2">

          {bottomNav.slice(0, 2).map((n) => (
            <BottomItem key={n.to} {...n} active={path === n.to} />
          ))}
          <div className="flex justify-center">
            <Link
              to="/sale"
              aria-label="Record a sale"
              className="-mt-8 flex h-14 w-14 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container shadow-raised transition-transform active:scale-95"
            >
              <Icon name="point_of_sale" className="text-[26px]" />
            </Link>
          </div>
          {bottomNav.slice(2).map((n) => (
            <BottomItem key={n.to} {...n} active={path === n.to} />
          ))}
        </div>
      </nav>
    </div>
  );
}

function BottomItem({
  to,
  icon,
  label,
  active,
}: {
  to: string;
  icon: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={`flex flex-col items-center gap-0.5 py-1 ${
        active ? "text-primary" : "text-on-surface-variant/70"
      }`}
    >
      <Icon name={icon} className={active ? "" : "opacity-80"} />
      <span className="text-[11px] font-semibold">{label}</span>
    </Link>
  );
}

export function Saved({ show, onUndo }: { show: boolean; onUndo: () => void }) {
  if (!show) return null;
  return (
    <div className="fixed inset-x-0 bottom-28 z-[60] mx-auto flex w-[min(92%,420px)] items-center gap-3 rounded-xl bg-inverse-surface px-4 py-3 text-inverse-on-surface shadow-raised md:bottom-8">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-inverse-primary text-primary">
        <Icon name="check" className="text-[18px]" />
      </span>
      <span className="flex-grow text-sm font-semibold">Saved</span>
      <button onClick={onUndo} className="text-sm font-bold text-inverse-primary underline">
        Undo
      </button>
    </div>
  );
}
