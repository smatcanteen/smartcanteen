import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Icon } from "./Icon";
import { useAuth, roleLabels, isAdminRole, homeForRole, type Role } from "@/lib/auth";
import { useSetupGate } from "@/lib/setup-gate";
import { BrandMark } from "./Brand";

export type AdminPerm =
  | "dashboard"
  | "accounts"
  | "new"
  | "agents"
  | "leads"
  | "commissions"
  | "support"
  | "announcements"
  | "revenue"
  | "suspend";

const matrix: Record<"admin" | "support" | "finance", AdminPerm[]> = {
  admin: [
    "dashboard",
    "accounts",
    "new",
    "agents",
    "leads",
    "commissions",
    "support",
    "announcements",
    "revenue",
    "suspend",
  ],
  support: ["dashboard", "accounts", "new", "leads", "support", "announcements"],
  finance: ["dashboard", "accounts", "agents", "commissions", "revenue"],
};

export const can = (role: Role | undefined, perm: AdminPerm) =>
  !!role && isAdminRole(role) && matrix[role as "admin" | "support" | "finance"].includes(perm);

const tabs: { to: string; label: string; perm: AdminPerm }[] = [
  { to: "/admin", label: "Dashboard", perm: "dashboard" },
  { to: "/admin/accounts", label: "Accounts", perm: "accounts" },
  { to: "/admin/new", label: "New account", perm: "new" },
  { to: "/admin/agents", label: "Agents", perm: "agents" },
  { to: "/admin/leads", label: "Leads", perm: "leads" },
  { to: "/admin/commissions", label: "Commissions", perm: "commissions" },
  { to: "/admin/support", label: "Support", perm: "support" },
  { to: "/admin/announcements", label: "Announcements", perm: "announcements" },
];

/** Shared chrome for every Super Admin / Support / Finance screen. */
export function AdminShell({ children }: { children: ReactNode }) {
  const { user, ready, logout } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const path = router.state.location.pathname;
  const requiredPermission = tabs.find((tab) => tab.to === path)?.perm ?? (path === "/admin" ? "dashboard" : null);

  useSetupGate(ready && !!user);

  useEffect(() => {
    if (!ready) return;

    if (!user) navigate({ to: "/login" });
    else if (!isAdminRole(user.role)) navigate({ to: homeForRole(user.role) });
    else if (user.otpPending) navigate({ to: "/first-run" });
    else if (requiredPermission && !can(user.role, requiredPermission)) navigate({ to: "/admin" });
  }, [ready, user, navigate, requiredPermission]);

  if (!user || !isAdminRole(user.role) || (requiredPermission && !can(user.role, requiredPermission))) return null;

  return (
    <div className="min-h-screen bg-surface-high pb-16">
      <div className="bg-primary">
        <header className="mx-auto flex h-16 w-full max-w-container-max items-center justify-between gap-2 px-3 sm:px-4 md:px-gutter">
          <div className="flex min-w-0 items-center gap-2">
            <BrandMark variant="dark" size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-on-primary sm:text-base">SmartCanteen Admin</p>
              <p className="truncate text-[11px] text-on-primary/70">
                {user.name} · {roleLabels[user.role]}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Link
              to="/"
              className="hidden min-h-11 items-center rounded-full px-3 text-sm font-semibold text-on-primary/80 hover:bg-on-primary/10 sm:flex"
            >
              Tenant app
            </Link>
            <button
              onClick={() => {
                logout();
                navigate({ to: "/login" });
              }}
              aria-label="Log out"
              className="rounded-full p-2 text-secondary-container hover:bg-on-primary/10"
            >
              <Icon name="logout" />
            </button>
          </div>
        </header>

        <nav className="mx-auto flex w-full max-w-container-max gap-1 overflow-x-auto px-3 pb-2 sm:px-4 md:px-gutter [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs
            .filter((t) => can(user.role, t.perm))
            .map((t) => (
              <Link
                key={t.to}
                to={t.to}
                preload="intent"
                activeOptions={{ exact: t.to === "/admin" }}
                activeProps={{
                  className: "bg-on-primary text-primary shadow-raised",
                  "aria-current": "page",
                }}
                inactiveProps={{ className: "text-on-primary/80 hover:bg-on-primary/10" }}
                className="shrink-0 rounded-full px-3 py-2 text-sm font-bold transition-colors sm:px-4"
              >
                {t.label}
              </Link>
            ))}
        </nav>
      </div>

      <main className="mx-auto w-full max-w-container-max space-y-sm px-3 py-md sm:space-y-md sm:px-4 md:px-gutter">
        {children}
      </main>

    </div>
  );
}

export function Kpi({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon?: string }) {
  return (
    <div className="card p-md">
      <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
        {icon ? <Icon name={icon} className="text-[16px]" /> : null} {label}
      </p>
      <p className="mt-1 truncate text-xl font-bold text-on-surface sm:text-2xl">{value}</p>
      {sub ? <p className="text-xs text-on-surface-variant">{sub}</p> : null}
    </div>
  );
}

export function Pill({ tone, children }: { tone: "good" | "warn" | "bad" | "info"; children: ReactNode }) {
  const tones = {
    good: "bg-primary-fixed text-on-secondary-container",
    warn: "bg-secondary-fixed text-on-secondary-container",
    bad: "bg-tertiary-container text-on-tertiary-container",
    info: "bg-surface-highest text-on-surface-variant",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export const statusTone = (status: string) =>
  status === "active"
    ? "good"
    : status === "trial"
      ? "info"
      : status === "past_due"
        ? "warn"
        : "bad";
