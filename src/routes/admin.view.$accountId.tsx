import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getOperatorBookPreview } from "@/lib/accounts.functions";
import { Card, SectionTitle } from "@/components/ui-kit";
import { Kpi, Pill } from "@/components/AdminShell";
import { useAuth } from "@/lib/auth";
import { exportCsv, exportPdf, type Sheet } from "@/lib/export";
import { fmtDate, statusLabels, ugxDisplay, usePlatform } from "@/lib/platform";
import { healthScore } from "@/lib/admin-metrics";
import { checkSales } from "@/lib/sales-check";

export const Route = createFileRoute("/admin/view/$accountId")({
  head: () => ({
    meta: [{ title: "View as operator — SmartCanteen Admin" }],
  }),
  component: ViewAsPage,
});

type Preview = {
  accountId: string;
  name: string;
  school: string;
  phone: string;
  active: boolean;
  lastLoginAt: number | null;
  termName: string;
  capital: number;
  sales: number;
  stock: number;
  expenses: number;
  cashAtHand: number;
  entries: number;
  avgDailySales: number;
  recent: { id: string; type: string; label: string; amount: number; ts: number; category?: string }[];
  stockRows: { name: string; qty: number; buy: number; sell: number }[];
  payments: any[];
  saleTxs?: { id: string; type: string; label: string; amount: number; ts: number }[];
  updatedAt: number | null;
};

function ViewAsPage() {
  const { accountId } = Route.useParams();
  const { user } = useAuth();
  const { s, logAction } = usePlatform();
  const tenant = s.tenants.find((t) => t.accountId === accountId);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void getOperatorBookPreview({ data: { accountId } })
      .then((res) => {
        if (!alive) return;
        if (!res.ok || !res.preview) {
          setError(res.error ?? "Could not load this school.");
          setLoading(false);
          return;
        }
        setPreview(res.preview as Preview);
        setLoading(false);
        logAction(user?.name ?? "admin", `View as operator · ${res.preview.name || accountId}`);
      })
      .catch(() => {
        if (!alive) return;
        setError("Could not load this school.");
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [accountId]);

  const health = tenant ? healthScore(tenant) : null;
  const check = preview ? checkSales(preview.saleTxs ?? []) : null;

  const exportPack = () => {
    if (!preview) return;
    const sheets: Sheet[] = [
      {
        name: "Summary",
        columns: ["Field", "Value"],
        rows: [
          ["Canteen / operator", preview.name],
          ["School", preview.school],
          ["Phone", preview.phone],
          ["Term", preview.termName || tenant?.termStart || "—"],
          ["Cash at hand", preview.cashAtHand],
          ["Sales", preview.sales],
          ["Stock spend", preview.stock],
          ["Expenses", preview.expenses],
          ["Entries", preview.entries],
          ["Avg daily sales (30d)", preview.avgDailySales],
        ],
      },
      {
        name: "Recent entries",
        columns: ["Date", "Type", "Description", "Amount"],
        rows: preview.recent.map((t) => [
          t.ts ? new Date(t.ts).toLocaleString("en-GB") : "",
          t.type,
          t.label,
          t.amount,
        ]),
      },
      {
        name: "Stock",
        columns: ["Item", "Qty", "Buy", "Sell"],
        rows: preview.stockRows.map((i) => [i.name, i.qty, i.buy, i.sell]),
      },
    ];
    exportPdf(
      `${preview.name || "School"} · cash book pack`,
      preview.school || "SmartCanteen export",
      sheets,
    );
    exportCsv(`${(preview.name || "school").replace(/\s+/g, "-").toLowerCase()}-entries`, sheets[1]!);
    logAction(user?.name ?? "admin", `Exported data pack · ${preview.name || accountId}`);
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Read only</p>
          <h1 className="text-2xl font-extrabold text-on-surface sm:text-3xl">
            View as · {tenant?.canteenName || preview?.name || "Operator"}
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Snapshot of their cash book. You cannot edit their numbers from here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/admin/accounts"
            className="inline-flex min-h-11 items-center rounded-full border-2 border-outline-variant px-4 text-sm font-bold"
          >
            Back to accounts
          </Link>
          <button
            type="button"
            disabled={!preview}
            onClick={exportPack}
            className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-bold text-on-primary disabled:opacity-40"
          >
            Export pack (PDF + CSV)
          </button>
        </div>
      </div>

      {loading ? <p className="text-sm text-on-surface-variant">Loading school books…</p> : null}
      {error ? <p className="text-sm font-bold text-tertiary">{error}</p> : null}

      {preview ? (
        <>
          <div className="flex flex-wrap gap-2">
            {tenant ? <Pill tone="warn">{statusLabels[tenant.status]}</Pill> : null}
            {health ? <Pill tone={health.score >= 50 ? "good" : "bad"}>Health {health.score}</Pill> : null}
            <Pill tone={preview.active ? "good" : "bad"}>{preview.active ? "Login on" : "Login paused"}</Pill>
          </div>

          <div className="grid grid-cols-2 gap-sm md:grid-cols-4">
            <Kpi label="Cash at hand" value={`UGX ${ugxDisplay(preview.cashAtHand)}`} icon="account_balance_wallet" />
            <Kpi label="Sales" value={`UGX ${ugxDisplay(preview.sales)}`} icon="payments" />
            <Kpi label="Entries" value={String(preview.entries)} icon="receipt_long" />
            <Kpi
              label="Avg daily sales"
              value={`UGX ${ugxDisplay(preview.avgDailySales)}`}
              sub="Last ~30 days"
              icon="trending_up"
            />
          </div>

          <Card className="space-y-1 text-sm">
            <p>
              <span className="text-on-surface-variant">Operator · </span>
              <span className="font-bold">{preview.name}</span>
            </p>
            <p>
              <span className="text-on-surface-variant">School · </span>
              <span className="font-bold">{preview.school || "—"}</span>
            </p>
            <p>
              <span className="text-on-surface-variant">Phone · </span>
              {preview.phone || "—"}
            </p>
            <p>
              <span className="text-on-surface-variant">Term · </span>
              {preview.termName || "—"}
            </p>
            <p>
              <span className="text-on-surface-variant">Last login · </span>
              {preview.lastLoginAt ? fmtDate(preview.lastLoginAt) : "Never"}
            </p>
          </Card>

          <Card className="space-y-sm">
            <SectionTitle>Sales check</SectionTitle>
            {check ? (
              <>
                <div className="grid grid-cols-2 gap-sm md:grid-cols-4">
                  <Kpi label="All sales" value={`UGX ${ugxDisplay(check.total)}`} icon="payments" />
                  <Kpi label="Cash sales" value={`UGX ${ugxDisplay(check.cashTotal)}`} sub={`${check.cashCount} entries`} icon="point_of_sale" />
                  <Kpi label="Credit paid back" value={`UGX ${ugxDisplay(check.creditTotal)}`} sub={`${check.creditCount} payments`} icon="group" />
                  <Kpi label="Possible repeats" value={String(check.flags.length)} sub={check.flags.length ? `up to UGX ${ugxDisplay(check.flaggedTotal)}` : "none found"} icon="content_copy" />
                </div>
                <p className="text-xs text-on-surface-variant">
                  Usual day UGX {ugxDisplay(check.avgDay)}. Whole term, biggest days first.
                </p>
                {check.days.slice(0, 8).map((d) => (
                  <div key={d.day} className="flex justify-between text-sm">
                    <span>
                      {new Date(d.ts).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                      <span className="ml-2 text-xs text-on-surface-variant">{d.count} entries</span>
                    </span>
                    <span className={`font-bold tabular-nums ${check.avgDay > 0 && d.total > check.avgDay * 2.5 ? "text-tertiary" : "text-primary"}`}>
                      UGX {ugxDisplay(d.total)}
                      {check.avgDay > 0 && d.total > check.avgDay * 2.5 ? " ⚠" : ""}
                    </span>
                  </div>
                ))}
                {check.flags.length > 0 ? (
                  <div className="space-y-1 border-t border-outline-variant pt-2">
                    <p className="text-sm font-bold text-tertiary">Possible double entries</p>
                    {check.flags.slice(0, 15).map((f) => (
                      <div key={f.id} className="flex justify-between gap-2 text-sm">
                        <span className="min-w-0">
                          <span className="font-semibold">{f.label}</span>
                          <span className="block text-xs text-on-surface-variant">
                            {new Date(f.ts).toLocaleString("en-GB")} · {f.reason}
                          </span>
                        </span>
                        <span className="shrink-0 font-bold tabular-nums text-tertiary">UGX {ugxDisplay(f.amount)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </Card>

          <Card className="space-y-sm">
            <SectionTitle>Recent cash-book lines</SectionTitle>
            {preview.recent.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No entries yet.</p>
            ) : (
              preview.recent.map((t) => (
                <div key={t.id || `${t.ts}-${t.label}`} className="flex justify-between gap-2 border-b border-outline-variant/40 py-2 text-sm last:border-0">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-on-surface">{t.label || t.type}</p>
                    <p className="text-xs text-on-surface-variant">
                      {t.ts ? new Date(t.ts).toLocaleString("en-GB") : ""} · {t.type}
                      {t.category ? ` · ${t.category}` : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 font-bold tabular-nums ${t.type === "sale" || t.type === "capital" ? "text-primary" : "text-tertiary"}`}>
                    {t.type === "sale" || t.type === "capital" ? "+" : "−"}
                    {ugxDisplay(t.amount)}
                  </span>
                </div>
              ))
            )}
          </Card>

          <Card className="space-y-sm">
            <SectionTitle>Stock snapshot</SectionTitle>
            {preview.stockRows.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No stock items.</p>
            ) : (
              preview.stockRows.slice(0, 20).map((i) => (
                <div key={i.name} className="flex justify-between text-sm">
                  <span className="font-semibold">{i.name}</span>
                  <span className="text-on-surface-variant">
                    {i.qty} · buy {ugxDisplay(i.buy)} · sell {ugxDisplay(i.sell)}
                  </span>
                </div>
              ))
            )}
          </Card>
        </>
      ) : null}
    </>
  );
}
