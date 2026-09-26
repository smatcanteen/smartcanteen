import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, Field, PrimaryButton, SectionTitle } from "@/components/ui-kit";
import { Kpi, Pill } from "@/components/AdminShell";
import { useAuth } from "@/lib/auth";
import { fmtDate, ugxDisplay, usePlatform } from "@/lib/platform";

export const Route = createFileRoute("/admin/payments")({
  head: () => ({
    meta: [
      { title: "Payments — SmartCanteen Admin" },
      { name: "description", content: "Match operator payment claims, confirm renewals and grant referral free months." },
    ],
  }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const { user } = useAuth();
  const {
    s,
    renewWithProof,
    dismissPaymentClaim,
    grantReferralCredit,
    dismissReferralClaim,
  } = usePlatform();
  const [err, setErr] = useState("");
  const [refByClaim, setRefByClaim] = useState<Record<string, string>>({});
  const [amountByClaim, setAmountByClaim] = useState<Record<string, string>>({});

  const pendingClaims = (s.paymentClaims ?? []).filter((c) => c.status === "pending");
  const pendingRefs = (s.referralClaims ?? []).filter((c) => c.status === "pending" && c.credits > 0);
  const paidThisMonth = (s.payments ?? []).filter((p) => {
    const d = new Date(p.ts);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthTotal = paidThisMonth.reduce((a, p) => a + p.amount, 0);

  return (
    <>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-primary">Billing</p>
        <h1 className="text-2xl font-extrabold text-on-surface sm:text-3xl">Payments inbox</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Operator “I paid” notes land here. Confirm with the mobile-money reference to renew access.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-sm md:grid-cols-4">
        <Kpi label="Claims waiting" value={String(pendingClaims.length)} icon="inbox" />
        <Kpi label="Referral free months" value={String(pendingRefs.length)} icon="card_giftcard" />
        <Kpi label="Paid this month" value={`UGX ${ugxDisplay(monthTotal)}`} icon="payments" />
        <Kpi label="Payments logged" value={String((s.payments ?? []).length)} icon="receipt_long" />
      </div>

      {err ? <p className="rounded-md bg-tertiary/10 px-3 py-2 text-sm font-bold text-tertiary">{err}</p> : null}

      <Card className="space-y-sm">
        <SectionTitle>Operator payment claims</SectionTitle>
        {pendingClaims.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No open claims. Operators add these on Plan & pay.</p>
        ) : null}
        {pendingClaims.map((c) => (
          <div key={c.id} className="space-y-2 rounded-md border border-outline-variant bg-surface-lowest p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-on-surface">{c.canteenName}</p>
                <p className="text-xs text-on-surface-variant">
                  {c.ownerName} · {c.phone} · {c.school || "—"}
                </p>
                <p className="mt-1 text-sm text-on-surface">
                  Claims UGX {ugxDisplay(c.amount)}
                  {c.note ? ` · “${c.note}”` : ""}
                </p>
                <p className="text-xs text-on-surface-variant">{fmtDate(c.ts)}</p>
              </div>
              <Pill tone="warn">Waiting</Pill>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
              <Field
                label="Amount received (UGX)"
                inputMode="numeric"
                value={amountByClaim[c.id] ?? String(c.amount || s.settings.priceUGX)}
                onChange={(e) => setAmountByClaim({ ...amountByClaim, [c.id]: e.target.value })}
              />
              <Field
                label="Mobile-money reference"
                value={refByClaim[c.id] ?? ""}
                onChange={(e) => setRefByClaim({ ...refByClaim, [c.id]: e.target.value })}
                placeholder="e.g. MM123ABC"
              />
              <PrimaryButton
                onClick={() => {
                  const res = renewWithProof({
                    accountId: c.accountId,
                    amount: Number(amountByClaim[c.id] ?? c.amount) || s.settings.priceUGX,
                    ref: refByClaim[c.id] ?? "",
                    note: c.note,
                    who: user?.name ?? "admin",
                    claimId: c.id,
                  });
                  if (!res.ok) setErr(res.error ?? "Could not renew");
                  else setErr("");
                }}
              >
                Confirm & renew
              </PrimaryButton>
              <button
                type="button"
                onClick={() => dismissPaymentClaim(c.id)}
                className="min-h-12 rounded-md border-2 border-outline-variant px-3 text-sm font-bold text-on-surface-variant"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </Card>

      <Card className="space-y-sm">
        <SectionTitle>Referral free months</SectionTitle>
        {pendingRefs.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No free-month credits waiting.</p>
        ) : null}
        {pendingRefs.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-lowest p-3">
            <div>
              <p className="font-bold text-on-surface">{r.canteenName}</p>
              <p className="text-xs text-on-surface-variant">
                Code {r.code || "—"}
                {r.referredByCode ? ` · joined with ${r.referredByCode}` : ""} · {r.credits} credit
                {r.credits === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const res = grantReferralCredit({ accountId: r.accountId, who: user?.name ?? "admin" });
                  if (!res.ok) setErr(res.error ?? "Could not grant");
                  else setErr("");
                }}
                className="min-h-11 rounded-full bg-primary px-4 text-sm font-bold text-on-primary"
              >
                Grant 1 month
              </button>
              <button
                type="button"
                onClick={() => dismissReferralClaim(r.id)}
                className="min-h-11 rounded-full border-2 border-outline-variant px-3 text-sm font-bold"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </Card>

      <Card className="space-y-sm">
        <SectionTitle>Confirmed payments</SectionTitle>
        {(s.payments ?? []).length === 0 ? (
          <p className="text-sm text-on-surface-variant">None yet — renewals with a MoMo reference appear here.</p>
        ) : null}
        {(s.payments ?? []).slice(0, 40).map((p) => {
          const t = s.tenants.find((x) => x.accountId === p.accountId);
          return (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-lowest p-3 text-sm">
              <div>
                <p className="font-bold text-on-surface">{t?.canteenName ?? p.accountId}</p>
                <p className="text-xs text-on-surface-variant">
                  {fmtDate(p.ts)} · ref {p.ref} · by {p.who}
                  {p.note ? ` · ${p.note}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold text-primary">UGX {ugxDisplay(p.amount)}</p>
                <p className="text-xs text-on-surface-variant">Access to {fmtDate(p.accessUntil)}</p>
              </div>
            </div>
          );
        })}
      </Card>
    </>
  );
}
