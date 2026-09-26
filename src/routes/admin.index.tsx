import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listAccountProgress } from "@/lib/accounts.functions";
import { Icon } from "@/components/Icon";
import { Card, SectionTitle } from "@/components/ui-kit";
import { Kpi, Pill, can, statusTone } from "@/components/AdminShell";
import { useAuth } from "@/lib/auth";
import { ugx } from "@/lib/store";
import { whatsappLink } from "@/lib/invite";
import { fmtDate, isActivated, isStalled, statusLabels, ugxDisplay, usePlatform } from "@/lib/platform";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard — SmartCanteen" },
      {
        name: "description",
        content: "Subscribers, revenue, renewals, activation funnel and the newest canteen accounts.",
      },
      { property: "og:title", content: "Admin Dashboard — SmartCanteen" },
      { property: "og:description", content: "Portfolio health at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const { s } = usePlatform();
  const t = s.tenants;

  const active = t.filter((x) => x.status === "active");
  const trial = t.filter((x) => x.status === "trial");
  const pastDue = t.filter((x) => x.status === "past_due");
  const churned = t.filter((x) => x.status === "churned");
  const [progress, setProgress] = useState<Record<string, { entries: number; lastLoginAt: number | null; checklist: { loggedIn: boolean; capitalSet: boolean; firstStock: boolean; firstSale: boolean } }>>({});
  const paidThisMonth = (s.payments ?? []).filter((p) => {
    const d = new Date(p.ts);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const cashIn = paidThisMonth.reduce((a, p) => a + p.amount, 0);
  const pendingClaims = (s.paymentClaims ?? []).filter((c) => c.status === "pending").length;
  const chaseMsg = (name: string, school: string) =>
    `Hello ${name}, this is SmartCanteen. Your canteen access for ${school || "your school"} is due for renewal soon. Pay UGX ${ugxDisplay(s.settings.priceUGX)} for ${s.settings.months} months to either +256 758 727269 or +256 783 113352, then send us the confirmation. Thank you.`;

  useEffect(() => {
    let alive = true;
    void listAccountProgress().then((res) => {
      if (!alive || !res.ok) return;
      setProgress(Object.fromEntries(res.rows.map((row) => [row.accountId, row])));
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const fortnight = Date.now() + 14 * 86400000;
  const renewals = t
    .filter((x) => x.nextBillingAt <= fortnight && x.nextBillingAt > Date.now() && x.status !== "churned" && x.status !== "suspended")
    .sort((a, b) => a.nextBillingAt - b.nextBillingAt);
  const recent = [...t].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);

  const liveTenant = (tenant: (typeof t)[number]) => {
    const p = progress[tenant.accountId];
    return p ? { ...tenant, entries: p.entries, lastLoginAt: p.lastLoginAt, checklist: p.checklist } : tenant;
  };
  const liveTenants = t.map(liveTenant);
  const funnel = {
    signed: liveTenants.length,
    loggedIn: liveTenants.filter((x) => x.checklist.loggedIn || !!x.lastLoginAt).length,
    activated: liveTenants.filter(isActivated).length,
  };
  const stalled = liveTenants.filter(isStalled).length;
  const atRisk = t.filter((x) => x.status === "past_due" || x.tags.includes("stalled")).length;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Portfolio overview</p>
          <h1 className="text-2xl font-extrabold text-on-surface sm:text-3xl">Admin dashboard</h1>
          <p className="mt-1 text-sm text-on-surface-variant">Subscriptions, setup progress and accounts needing attention.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/accounts" className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-primary px-4 text-sm font-bold text-primary">
            <Icon name="storefront" className="text-[18px]" /> Manage accounts
          </Link>
          {can(user?.role, "new") ? (
            <Link to="/admin/new" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-on-primary shadow-sm">
              <Icon name="person_add" className="text-[18px]" /> New account
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-sm md:grid-cols-5">
        <Kpi label="Active subscribers" value={String(active.length)} icon="verified" />
        {can(user?.role, "revenue") ? (
          <Kpi
            label="Cash in this month"
            value={`UGX ${ugxDisplay(cashIn)}`}
            sub={`${paidThisMonth.length} confirmed payments · ${pendingClaims} claim${pendingClaims === 1 ? "" : "s"} waiting`}
            icon="payments"
          />
        ) : null}
        <Kpi label="On trial" value={String(trial.length)} icon="schedule" />
        <Kpi label="Expired" value={String(pastDue.length)} icon="error" />
        <Kpi label="Deactivated" value={String(churned.length)} icon="block" />
      </div>

      <Card className="min-w-0 space-y-sm">
        <SectionTitle>Activation funnel</SectionTitle>
        <div className="grid grid-cols-3 gap-sm">
          <Step label="Signed up" value={funnel.signed} total={funnel.signed} />
          <Step label="Logged in" value={funnel.loggedIn} total={funnel.signed} />
          <Step label="First real entry" value={funnel.activated} total={funnel.signed} />
        </div>
        <p className="text-xs text-on-surface-variant">
          {stalled} account{stalled === 1 ? "" : "s"} logged in but never set opening term capital · {atRisk} at
          risk this month.
        </p>
      </Card>

      <div className="grid min-w-0 gap-md md:grid-cols-2">
        <Card className="min-w-0 space-y-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionTitle>Renewals due in 14 days</SectionTitle>
            {renewals.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  renewals.forEach((r, i) => {
                    const href = whatsappLink(r.phone, chaseMsg(r.ownerName || r.canteenName, r.school));
                    if (!href) return;
                    window.setTimeout(() => window.open(href, "_blank"), i * 450);
                  });
                }}
                className="min-h-9 rounded-full border border-primary px-3 text-xs font-bold text-primary"
              >
                WhatsApp all ({renewals.length})
              </button>
            ) : null}
          </div>
          {renewals.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Nothing due in the next two weeks.</p>
          ) : (
            renewals.map((r) => {
              const href = whatsappLink(r.phone, chaseMsg(r.ownerName || r.canteenName, r.school));
              return (
                <div key={r.accountId} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-lowest p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-on-surface">{r.canteenName}</p>
                    <p className="text-xs text-on-surface-variant">{r.phone || "No phone"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-on-surface-variant">{fmtDate(r.nextBillingAt)}</span>
                    {href ? (
                      <a href={href} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary underline">
                        WhatsApp
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </Card>

        <Card className="min-w-0 space-y-sm">
          <SectionTitle>Recently created accounts</SectionTitle>
          {recent.map((r) => (
            <Link
              key={r.accountId}
              to="/admin/accounts"
              className="flex items-center justify-between gap-2 rounded-md bg-surface-lowest p-3 hover:bg-surface-low"
            >
              <span className="min-w-0 truncate text-sm font-bold text-on-surface">
                {r.canteenName} <span className="font-normal text-on-surface-variant">— {r.school || "—"}</span>
              </span>
              <Pill tone={statusTone(r.status)}>{statusLabels[r.status]}</Pill>
            </Link>
          ))}
        </Card>
      </div>

      <p className="flex items-center gap-1 text-xs text-outline">
        <Icon name="lock" className="text-[14px]" /> Administrators never see a student's individual credit record.
      </p>
    </>
  );
}

function Step({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-md bg-surface-lowest p-3">
      <p className="text-xs font-semibold text-on-surface-variant">{label}</p>
      <p className="text-xl font-bold text-on-surface">{value}</p>
      <div className="mt-1 h-1.5 rounded-full bg-outline-variant">
        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-on-surface-variant">{pct}%</p>
    </div>
  );
}
