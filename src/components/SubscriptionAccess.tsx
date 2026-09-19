import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { effectiveTenantStatus, usePlatform } from "@/lib/platform";

const readOnlyRoutes = new Set(["/", "/report", "/history", "/subscription", "/support", "/settings"]);

export function SubscriptionAccess({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { s, hydrated } = usePlatform();
  const navigate = useNavigate();
  const router = useRouter();
  const path = router.state.location.pathname;
  const [now, setNow] = useState(Date.now());
  const tenant = user?.role === "operator" ? s.tenants.find((item) => item.accountId === user.id) : null;
  const status = tenant ? effectiveTenantStatus(tenant, now) : null;
  const readOnly = status === "past_due" || status === "churned";
  const blocked = readOnly && !readOnlyRoutes.has(path);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (hydrated && blocked) navigate({ to: "/subscription", replace: true });
  }, [blocked, hydrated, navigate]);

  if (blocked) return null;

  return (
    <>
      {readOnly ? (
        <div className="sticky top-0 z-[80] flex flex-wrap items-center justify-center gap-2 bg-secondary px-3 py-2 text-center text-xs font-bold text-on-secondary">
          <span>Your subscription has ended. Past reports remain available, but new entries are locked.</span>
          <Link to="/subscription" className="rounded-full bg-on-secondary px-3 py-1 text-secondary">Renew access</Link>
        </div>
      ) : null}
      {children}
    </>
  );
}
