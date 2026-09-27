import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getOperatorBookPreview, listAccountProgress } from "@/lib/accounts.functions";
import { Card, SectionTitle } from "@/components/ui-kit";
import { Kpi } from "@/components/AdminShell";
import { useAuth } from "@/lib/auth";
import {
  mergeProgress,
  withHealth,
  zoneBenchmarks,
  type ProgressRow,
} from "@/lib/admin-metrics";
import { exportCsv, exportExcel, type Sheet } from "@/lib/export";
import { fmtDate, statusLabels, ugxDisplay, usePlatform } from "@/lib/platform";

export const Route = createFileRoute("/admin/insights")({
  head: () => ({
    meta: [{ title: "Insights — SmartCanteen Admin" }],
  }),
  component: InsightsPage,
});

function InsightsPage() {
  const { user } = useAuth();
  const { s, logAction } = usePlatform();
  const [progress, setProgress] = useState<Record<string, ProgressRow>>({});
  const [salesMap, setSalesMap] = useState<Record<string, number>>({});
  const [loadingSales, setLoadingSales] = useState(false);

  useEffect(() => {
    let alive = true;
    void listAccountProgress()
      .then((res) => {
        if (!alive || !res.ok) return;
        setProgress(Object.fromEntries(res.rows.map((row) => [row.accountId, row])));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const live = useMemo(
    () => withHealth(s.tenants.map((t) => mergeProgress(t, progress[t.accountId]))),
    [s.tenants, progress],
  );

  const zones = zoneBenchmarks(live, salesMap);

  const loadSales = async () => {
    setLoadingSales(true);
    const next: Record<string, number> = {};
    const ids = live.filter((t) => t.status === "active" || t.status === "trial").map((t) => t.accountId);
    for (let i = 0; i < ids.length; i += 5) {
      const chunk = ids.slice(i, i + 5);
      await Promise.all(
        chunk.map(async (id) => {
          try {
            const res = await getOperatorBookPreview({ data: { accountId: id } });
            if (res.ok && res.preview) next[id] = res.preview.avgDailySales || 0;
          } catch {
            /* skip */
          }
        }),
      );
    }
    setSalesMap(next);
    setLoadingSales(false);
    logAction(user?.name ?? "admin", "Loaded zone sales benchmarks");
  };

  const exportPortfolio = () => {
    const sheet: Sheet = {
      name: "Schools",
      columns: [
        "Canteen",
        "School",
        "Zone",
        "Status",
        "Health",
        "Entries",
        "Last login",
        "Access ends",
        "Avg daily sales",
      ],
      rows: live.map((t) => [
        t.canteenName,
        t.school,
        t.zone,
        statusLabels[t.status],
        t.health,
        t.entries,
        t.lastLoginAt ? fmtDate(t.lastLoginAt) : "",
        fmtDate(t.nextBillingAt),
        salesMap[t.accountId] ?? "",
      ]),
    };
    const zoneSheet: Sheet = {
      name: "Zones",
      columns: ["Zone", "Schools", "Active", "Avg entries", "Avg daily sales"],
      rows: zones.map((z) => [z.zone, z.schools, z.active, z.avgEntries, z.avgDailySales ?? ""]),
    };
    exportExcel("smartcanteen-portfolio", [sheet, zoneSheet], "SmartCanteen portfolio");
    exportCsv("smartcanteen-schools", sheet);
    logAction(user?.name ?? "admin", "Exported portfolio insights");
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Benchmarks</p>
          <h1 className="text-2xl font-extrabold text-on-surface sm:text-3xl">Insights</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Zone comparison and a full school data pack for agents and finance.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loadingSales}
            onClick={() => void loadSales()}
            className="min-h-11 rounded-full border-2 border-primary px-4 text-sm font-bold text-primary disabled:opacity-50"
          >
            {loadingSales ? "Loading sales…" : "Load avg daily sales"}
          </button>
          <button
            type="button"
            onClick={exportPortfolio}
            className="min-h-11 rounded-full bg-primary px-4 text-sm font-bold text-on-primary"
          >
            Export portfolio
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-sm md:grid-cols-4">
        <Kpi label="Zones" value={String(zones.length)} icon="map" />
        <Kpi label="Schools" value={String(live.length)} icon="school" />
        <Kpi label="Active" value={String(live.filter((t) => t.status === "active").length)} icon="verified" />
        <Kpi
          label="Sales samples"
          value={String(Object.keys(salesMap).length)}
          sub="Loaded avg daily"
          icon="payments"
        />
      </div>

      <Card className="space-y-sm">
        <SectionTitle>Avg by zone</SectionTitle>
        <p className="text-xs text-on-surface-variant">
          Tap “Load avg daily sales” to pull each active school’s recent sales (takes a moment).
        </p>
        {zones.map((z) => (
          <div key={z.zone} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-lowest p-3">
            <div>
              <p className="font-bold text-on-surface">{z.zone}</p>
              <p className="text-xs text-on-surface-variant">
                {z.active} active · {z.schools} schools · avg {z.avgEntries} cash-book entries
              </p>
            </div>
            <p className="text-sm font-bold text-primary">
              {z.avgDailySales != null ? `UGX ${ugxDisplay(z.avgDailySales)}/day` : "—"}
            </p>
          </div>
        ))}
      </Card>

      <Card className="space-y-sm">
        <SectionTitle>School pack links</SectionTitle>
        <p className="text-xs text-on-surface-variant">
          Open any school for a read-only view and PDF/CSV export of their book.
        </p>
        {live
          .slice()
          .sort((a, b) => a.canteenName.localeCompare(b.canteenName))
          .map((t) => (
            <div key={t.accountId} className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/40 py-2 last:border-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-on-surface">{t.canteenName}</p>
                <p className="text-xs text-on-surface-variant">
                  {t.zone} · {statusLabels[t.status]} · health {t.health}
                </p>
              </div>
              <Link
                to="/admin/view/$accountId"
                params={{ accountId: t.accountId }}
                className="text-xs font-bold text-primary underline"
              >
                View & export
              </Link>
            </div>
          ))}
      </Card>
    </>
  );
}
