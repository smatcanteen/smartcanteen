import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, SectionTitle } from "@/components/ui-kit";
import { Kpi, Pill } from "@/components/AdminShell";
import { ugx } from "@/lib/store";
import { fmtDate, usePlatform } from "@/lib/platform";

export const Route = createFileRoute("/admin/commissions")({
  head: () => ({
    meta: [
      { title: "Commissions & Payouts — SmartCanteen Admin" },
      {
        name: "description",
        content: "Approve signup bonuses and recurring trail commissions, apply clawbacks and reconcile agent payouts.",
      },
      { property: "og:title", content: "Commissions & Payouts — SmartCanteen Admin" },
      { property: "og:description", content: "Agent earnings, approved and paid with a mobile money reference." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Commissions,
});

function Commissions() {
  const { s, setCommissionStatus, markPayoutPaid } = usePlatform();
  const [ref, setRef] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const sum = (status: string) =>
    s.commissions.filter((c) => c.status === status).reduce((a, c) => a + c.amount, 0);
  const name = (id: string) => s.agents.find((a) => a.id === id)?.name ?? "—";
  const canteen = (id: string) => s.tenants.find((t) => t.accountId === id)?.canteenName ?? "—";

  const clawbackDue = (accountId: string, createdAt: number) => {
    const t = s.tenants.find((x) => x.accountId === accountId);
    return !!t && t.status === "churned" && Date.now() - createdAt < s.settings.clawbackDays * 86400000;
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-sm md:grid-cols-4">
        <Kpi label="Pending" value={`UGX ${ugx(sum("pending"))}`} icon="hourglass_top" />
        <Kpi label="Approved" value={`UGX ${ugx(sum("approved"))}`} icon="task_alt" />
        <Kpi label="Paid" value={`UGX ${ugx(sum("paid"))}`} icon="payments" />
        <Kpi label="Clawed back" value={`UGX ${ugx(sum("clawback"))}`} icon="undo" />
      </div>

      {error ? <p className="rounded-md bg-tertiary/10 px-3 py-2 text-sm font-bold text-tertiary">{error}</p> : null}

      <Card className="space-y-sm">
        <SectionTitle>Commission ledger</SectionTitle>
        {s.commissions.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-lowest p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-on-surface">
                {name(c.agentId)} — {canteen(c.accountId)}
              </p>
              <p className="text-xs text-on-surface-variant">
                {c.type === "signup" ? "Signup bonus" : `Recurring trail ${c.period ?? ""}`} · {fmtDate(c.createdAt)}
                {c.batchRef ? ` · ref ${c.batchRef}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-on-surface">UGX {ugx(c.amount)}</span>
              <Pill tone={c.status === "paid" ? "good" : c.status === "clawback" ? "bad" : "warn"}>{c.status}</Pill>
              {c.status === "pending" ? (
                <button onClick={() => setCommissionStatus(c.id, "approved")} className="text-xs font-bold text-primary underline">
                  Approve
                </button>
              ) : null}
              {c.status === "approved" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    aria-label={`Payment reference for ${name(c.agentId)}`}
                    placeholder="Mobile-money reference"
                    value={ref[c.id] ?? ""}
                    onChange={(e) => setRef({ ...ref, [c.id]: e.target.value })}
                    className="h-10 min-w-44 rounded-md border-2 border-outline-variant bg-surface px-2 text-sm"
                  />
                  <button
                    onClick={() => {
                      const paymentRef = (ref[c.id] ?? "").trim();
                      if (!paymentRef) return setError("Enter the real mobile-money reference before marking a commission paid.");
                      setError("");
                      setCommissionStatus(c.id, "paid", paymentRef);
                    }}
                    className="text-xs font-bold text-primary underline"
                  >
                    Mark paid
                  </button>
                </div>
              ) : null}
              {c.type === "signup" && c.status !== "clawback" && clawbackDue(c.accountId, c.createdAt) ? (
                <button onClick={() => setCommissionStatus(c.id, "clawback")} className="text-xs font-bold text-tertiary underline">
                  Clawback
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </Card>

      <Card className="space-y-sm">
        <SectionTitle>Payout requests</SectionTitle>
        {s.payouts.length === 0 ? <p className="text-sm text-on-surface-variant">No payout requests.</p> : null}
        {s.payouts.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-lowest p-3">
            <div>
              <p className="text-sm font-bold text-on-surface">
                {name(p.agentId)} — UGX {ugx(p.amount)}
              </p>
              <p className="text-xs text-on-surface-variant">
                {fmtDate(p.ts)} {p.ref ? `· ref ${p.ref}` : ""}
              </p>
            </div>
            {p.status === "requested" ? (
              <div className="flex items-center gap-2">
                <input
                  aria-label="Mobile money reference"
                  placeholder="MM reference"
                  value={ref[p.id] ?? ""}
                  onChange={(e) => setRef({ ...ref, [p.id]: e.target.value })}
                  className="h-11 rounded-md border-2 border-outline-variant bg-surface px-2 text-sm"
                />
                <button
                  onClick={() => {
                    const paymentRef = (ref[p.id] ?? "").trim();
                    if (!paymentRef) return setError("Enter the real mobile-money reference before marking a payout paid.");
                    setError("");
                    markPayoutPaid(p.id, paymentRef);
                  }}
                  className="min-h-11 rounded-full bg-primary px-4 text-sm font-bold text-on-primary"
                >
                  Mark paid
                </button>
              </div>
            ) : (
              <Pill tone="good">Paid</Pill>
            )}
          </div>
        ))}
      </Card>
    </>
  );
}
