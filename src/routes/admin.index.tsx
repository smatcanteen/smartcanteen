import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { GroupedBars } from "@/components/Charts";
import { Icon } from "@/components/Icon";
import { Card, SectionTitle } from "@/components/ui-kit";
import { Kpi, Pill, can, statusTone } from "@/components/AdminShell";
import { useAuth } from "@/lib/auth";
import { ugx } from "@/lib/store";
import { fmtDate, isActivated, isStalled, statusLabels, usePlatform } from "@/lib/platform";

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
  const mrr = active.length * s.settings.priceUGX;

  const payments = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const count = t.filter((x) => {
        const c = new Date(x.createdAt);
        return c <= d && x.status !== "trial";
      }).length;
      return {
        label: d.toLocaleDateString("en-GB", { month: "short" }),
        values: { collected: count * s.settings.priceUGX },
      };
    });
  }, [t, s.settings.priceUGX]);

  const week = Date.now() + 7 * 86400000;
  const renewals = t.filter((x) => x.nextBillingAt <= week && x.status !== "churned");
  const recent = [...t].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);

  const funnel = {
    signed: t.length,
    loggedIn: t.filter((x) => x.checklist.loggedIn).length,
    activated: t.filter(isActivated).length,
  };
  const stalled = t.filter(isStalled).length;
  const atRisk = t.filter((x) => x.status === "past_due" || x.tags.includes("stalled")).length;

  return (
    <>
      <div className="grid grid-cols-2 gap-sm md:grid-cols-5">
        <Kpi label="Active subscribers" value={String(active.length)} icon="verified" />
        {can(user?.role, "revenue") ? (
          <Kpi
            label="MRR"
            value={`UGX ${ugx(mrr)}`}
            sub={`${active.length} × ${ugx(s.settings.priceUGX)} / ${s.settings.months} months`}
            icon="payments"
          />
        ) : null}
        <Kpi label="On trial" value={String(trial.length)} icon="schedule" />
        <Kpi label="Past due" value={String(pastDue.length)} icon="error" />
        <Kpi label="Churned this month" value={String(churned.length)} icon="trending_down" />
      </div>

      {can(user?.role, "revenue") ? (
        <Card className="min-w-0 space-y-sm">
          <SectionTitle>Payments collected — last 6 months</SectionTitle>
          <GroupedBars
            rows={payments}
            series={[{ key: "collected", label: "Collected (UGX)", color: "var(--color-primary)" }]}
          />
        </Card>
      ) : null}

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
          <SectionTitle>Renewals due in 7 days</SectionTitle>
          {renewals.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Nothing due this week.</p>
          ) : (
            renewals.map((r) => (
              <div key={r.accountId} className="flex items-center justify-between gap-2 rounded-md bg-surface-lowest p-3">
                <span className="min-w-0 truncate text-sm font-bold text-on-surface">{r.canteenName}</span>
                <span className="shrink-0 text-xs text-on-surface-variant">{fmtDate(r.nextBillingAt)}</span>
              </div>
            ))
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
