import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, Field, PrimaryButton, SectionTitle } from "@/components/ui-kit";
import { Kpi, Pill } from "@/components/AdminShell";
import { useAuth } from "@/lib/auth";
import { exportPaymentReceipt } from "@/lib/export";
import { prorateAmount } from "@/lib/admin-metrics";
import { fmtDate, ugxDisplay, usePlatform } from "@/lib/platform";

export const Route = createFileRoute("/admin/payments")({
  head: () => ({
    meta: [
      { title: "Payments — SmartCanteen Admin" },
      {
        name: "description",
        content: "Match operator payment claims, confirm renewals and grant referral free months.",
      },
    ],
  }),
  component: PaymentsPage,
});

const methodLabel = (m?: string) =>
  m === "cash" ? "Cash" : m === "bank" ? "Bank" : "Mobile money";

function PaymentsPage() {
  const { user, accounts, toggleAccount } = useAuth();
  const {
    s,
    renewWithProof,
    dismissPaymentClaim,
    grantReferralCredit,
    dismissReferralClaim,
  } = usePlatform();
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [refByClaim, setRefByClaim] = useState<Record<string, string>>({});
  const [amountByClaim, setAmountByClaim] = useState<Record<string, string>>({});
  const [monthsByClaim, setMonthsByClaim] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const pendingClaims = (s.paymentClaims ?? []).filter((c) => c.status === "pending");
  const pendingRefs = (s.referralClaims ?? []).filter((c) => c.status === "pending" && c.credits > 0);
  const paidThisMonth = (s.payments ?? []).filter((p) => {
    const d = new Date(p.ts);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthTotal = paidThisMonth.reduce((a, p) => a + p.amount, 0);

  const confirmClaim = async (c: (typeof pendingClaims)[number]) => {
    setBusyId(c.id);
    setErr("");
    setOkMsg("");
    const txn = (refByClaim[c.id] ?? c.transactionId ?? "").trim();
    const months = Math.max(1, Math.min(s.settings.months || 4, Number(monthsByClaim[c.id]) || s.settings.months || 4));
    const amount = Number(amountByClaim[c.id] ?? c.amount) || prorateAmount(s.settings.priceUGX, s.settings.months, months);
    const res = renewWithProof({
      accountId: c.accountId,
      amount,
      ref: txn,
      note: c.note,
      who: user?.name ?? "admin",
      claimId: c.id,
      operatorName: c.operatorName || c.ownerName,
      school: c.school,
      termName: c.termName,
      method: c.method || "mobile_money",
      transactionId: txn,
      months,
    });
    if (!res.ok) {
      setErr(res.error ?? "Could not confirm");
      setBusyId(null);
      return;
    }
    const account = accounts.find((a) => a.id === c.accountId);
    if (account && !account.active) await toggleAccount(c.accountId);
    exportPaymentReceipt({
      canteenName: c.canteenName,
      operatorName: c.operatorName || c.ownerName || "",
      school: c.school || "",
      termName: c.termName,
      amount,
      method: c.method === "cash" ? "Cash" : c.method === "bank" ? "Bank" : "Mobile money",
      transactionId: txn,
      accessUntil: res.accessUntil!,
      months,
      paidAt: Date.now(),
      confirmedBy: user?.name ?? "admin",
      receiptNo: `SC-${c.id.slice(0, 8).toUpperCase()}`,
    });
    setOkMsg(
      `Payment confirmed · ${c.operatorName || c.ownerName} · activated until ${fmtDate(res.accessUntil!)} · receipt opened`,
    );
    setBusyId(null);
  };

  return (
    <>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-primary">Billing</p>
        <h1 className="text-2xl font-extrabold text-on-surface sm:text-3xl">Payments inbox</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Operator submits name, school, term, mobile money and transaction ID. You confirm receipt → account activates.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-sm md:grid-cols-4">
        <Kpi label="Claims waiting" value={String(pendingClaims.length)} icon="inbox" />
        <Kpi label="Referral free months" value={String(pendingRefs.length)} icon="card_giftcard" />
        <Kpi label="Paid this month" value={`UGX ${ugxDisplay(monthTotal)}`} icon="payments" />
        <Kpi label="Payments logged" value={String((s.payments ?? []).length)} icon="receipt_long" />
      </div>

      {err ? <p className="rounded-md bg-tertiary/10 px-3 py-2 text-sm font-bold text-tertiary">{err}</p> : null}
      {okMsg ? <p className="rounded-md bg-primary/10 px-3 py-2 text-sm font-bold text-primary">{okMsg}</p> : null}

      <Card className="space-y-sm">
        <SectionTitle>Waiting for your confirmation</SectionTitle>
        {pendingClaims.length === 0 ? (
          <p className="text-sm text-on-surface-variant">
            No open claims. Operators submit these on Plan & pay after they send mobile money.
          </p>
        ) : null}
        {pendingClaims.map((c) => (
          <div key={c.id} className="space-y-3 rounded-md border border-outline-variant bg-surface-lowest p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <p className="font-bold text-on-surface">{c.canteenName}</p>
                <dl className="grid gap-1 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-[11px] font-bold uppercase text-on-surface-variant">Operator</dt>
                    <dd className="font-semibold text-on-surface">{c.operatorName || c.ownerName || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-bold uppercase text-on-surface-variant">School</dt>
                    <dd className="font-semibold text-on-surface">{c.school || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-bold uppercase text-on-surface-variant">Term</dt>
                    <dd className="font-semibold text-on-surface">{c.termName || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-bold uppercase text-on-surface-variant">Mode of payment</dt>
                    <dd className="font-semibold text-on-surface">{methodLabel(c.method)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-bold uppercase text-on-surface-variant">Amount claimed</dt>
                    <dd className="font-semibold text-on-surface">UGX {ugxDisplay(c.amount)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-bold uppercase text-on-surface-variant">Transaction ID</dt>
                    <dd className="font-mono font-semibold text-on-surface">{c.transactionId || "— not provided —"}</dd>
                  </div>
                </dl>
                <p className="text-xs text-on-surface-variant">
                  {c.phone || "No phone"} · submitted {fmtDate(c.ts)}
                  {c.note ? ` · “${c.note}”` : ""}
                </p>
              </div>
              <Pill tone="warn">Waiting</Pill>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto_auto] sm:items-end">
              <Field
                label="Months (1–4 partial OK)"
                inputMode="numeric"
                value={monthsByClaim[c.id] ?? String(s.settings.months)}
                onChange={(e) => {
                  const m = e.target.value.replace(/\D/g, "").slice(0, 1);
                  setMonthsByClaim({ ...monthsByClaim, [c.id]: m });
                  const months = Math.max(1, Math.min(s.settings.months || 4, Number(m) || 1));
                  setAmountByClaim({
                    ...amountByClaim,
                    [c.id]: String(prorateAmount(s.settings.priceUGX, s.settings.months, months)),
                  });
                }}
              />
              <Field
                label="Amount received (UGX)"
                inputMode="numeric"
                value={amountByClaim[c.id] ?? String(c.amount || s.settings.priceUGX)}
                onChange={(e) => setAmountByClaim({ ...amountByClaim, [c.id]: e.target.value })}
              />
              <Field
                label="Confirm transaction ID"
                value={refByClaim[c.id] ?? c.transactionId ?? ""}
                onChange={(e) => setRefByClaim({ ...refByClaim, [c.id]: e.target.value })}
                placeholder="Match the MoMo SMS"
              />
              <PrimaryButton disabled={busyId === c.id} onClick={() => void confirmClaim(c)}>
                {busyId === c.id ? "Working…" : "Confirm & activate"}
              </PrimaryButton>
              <button
                type="button"
                onClick={() => dismissPaymentClaim(c.id)}
                className="min-h-12 rounded-md border-2 border-outline-variant px-3 text-sm font-bold text-on-surface-variant"
              >
                Dismiss
              </button>
            </div>
            <p className="text-xs text-on-surface-variant">
              Confirm only after you see this money on your phone. That starts / renews their paid access for{" "}
              {s.settings.months} months.
            </p>
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
          <p className="text-sm text-on-surface-variant">None yet — confirmed claims appear here.</p>
        ) : null}
        {(s.payments ?? []).slice(0, 40).map((p) => {
          const t = s.tenants.find((x) => x.accountId === p.accountId);
          return (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-lowest p-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-bold text-on-surface">{t?.canteenName ?? p.accountId}</p>
                <p className="text-xs text-on-surface-variant">
                  {p.operatorName || t?.ownerName || "—"}
                  {p.school || t?.school ? ` · ${p.school || t?.school}` : ""}
                  {p.termName ? ` · ${p.termName}` : ""}
                  {" · "}
                  {methodLabel(p.method)}
                </p>
                <p className="font-mono text-xs text-on-surface">
                  Txn {p.transactionId || p.ref} · by {p.who} · {fmtDate(p.ts)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold text-primary">UGX {ugxDisplay(p.amount)}</p>
                <p className="text-xs text-on-surface-variant">Access to {fmtDate(p.accessUntil)}</p>
                <button
                  type="button"
                  className="text-xs font-bold text-primary underline"
                  onClick={() =>
                    exportPaymentReceipt({
                      canteenName: t?.canteenName ?? p.accountId,
                      operatorName: p.operatorName || t?.ownerName || "",
                      school: p.school || t?.school || "",
                      termName: p.termName,
                      amount: p.amount,
                      method: p.method === "cash" ? "Cash" : p.method === "bank" ? "Bank" : "Mobile money",
                      transactionId: p.transactionId || p.ref,
                      accessUntil: p.accessUntil,
                      months: s.settings.months,
                      paidAt: p.ts,
                      confirmedBy: p.who,
                      receiptNo: `SC-${p.id.slice(0, 8).toUpperCase()}`,
                    })
                  }
                >
                  Receipt PDF
                </button>
              </div>
            </div>
          );
        })}
      </Card>
    </>
  );
}
