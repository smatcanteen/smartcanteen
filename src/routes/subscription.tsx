import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout, Saved } from "@/components/AppLayout";
import { Icon } from "@/components/Icon";
import { Card, Field, PrimaryButton, SectionTitle, SelectField } from "@/components/ui-kit";
import { ugx, useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { effectiveTenantStatus, fmtDate, statusLabels, usePlatform } from "@/lib/platform";
import {
  openWhatsApp,
  PLAN_LABEL,
  PLAN_PRICE_UGX,
  referralShareMessage,
  renewalReminderMessage,
} from "@/lib/operator-helpers";

export const Route = createFileRoute("/subscription")({
  head: () => ({
    meta: [
      { title: "Subscription — SmartCanteen" },
      {
        name: "description",
        content: `One prepay payment of UGX ${PLAN_PRICE_UGX.toLocaleString("en-UG")} covers four months of SmartCanteen — see your plan, how to pay and your payment history.`,
      },
      { property: "og:title", content: "Subscription — SmartCanteen" },
      {
        property: "og:description",
        content: "Prepay four months at a time. No monthly renewal to remember.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SubscriptionPage,
});

const NUMBERS = ["+256 758 727269", "+256 783 113352"];

const methodLabel = (m?: string) =>
  m === "cash" ? "Cash" : m === "bank" ? "Bank" : "Mobile money";

function SubscriptionPage() {
  const {
    state,
    addPayment,
    ensureReferralCode,
    applyReferralCode,
    redeemReferralCredit,
  } = useStore();
  const { user } = useAuth();
  const { s } = usePlatform();
  const tenant = s.tenants.find((item) => item.accountId === user?.id);
  const status = tenant ? effectiveTenantStatus(tenant) : null;
  const [amount, setAmount] = useState(String(PLAN_PRICE_UGX));
  const [operatorName, setOperatorName] = useState(user?.name ?? "");
  const [school, setSchool] = useState(user?.school ?? tenant?.school ?? "");
  const [termName, setTermName] = useState(state.termName || "");
  const [method, setMethod] = useState<"mobile_money" | "cash" | "bank">("mobile_money");
  const [transactionId, setTransactionId] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState("");
  const [refInput, setRefInput] = useState("");
  const [refMsg, setRefMsg] = useState("");
  const [myCode, setMyCode] = useState(state.referralCode ?? "");

  useEffect(() => {
    const code = ensureReferralCode(user?.id ?? null);
    setMyCode(code);
  }, [user?.id, ensureReferralCode]);

  useEffect(() => {
    if (user?.name) setOperatorName((n) => n || user.name || "");
    if (user?.school || tenant?.school) setSchool((s0) => s0 || user?.school || tenant?.school || "");
    if (state.termName) setTermName((t) => t || state.termName);
  }, [user?.name, user?.school, tenant?.school, state.termName]);

  const daysLeft = tenant
    ? Math.ceil((new Date(tenant.nextBillingAt).getTime() - Date.now()) / 86_400_000)
    : null;
  const renewalSoon = daysLeft != null && daysLeft <= 14;

  const submitPayment = () => {
    const v = Number(amount) || 0;
    if (!v) {
      setFormError("Enter the amount you paid.");
      return;
    }
    if (!operatorName.trim()) {
      setFormError("Enter the operator name.");
      return;
    }
    if (!school.trim()) {
      setFormError("Enter the school name.");
      return;
    }
    if (!termName.trim()) {
      setFormError("Enter the term you are paying for.");
      return;
    }
    if (method === "mobile_money" && transactionId.trim().length < 4) {
      setFormError("Enter the mobile-money transaction ID from the confirmation SMS.");
      return;
    }
    addPayment(v, note.trim(), {
      operatorName: operatorName.trim(),
      school: school.trim(),
      termName: termName.trim(),
      method,
      transactionId: transactionId.trim(),
    });
    setTransactionId("");
    setNote("");
    setFormError("");
    setSaved(true);
    setTimeout(() => setSaved(false), 3500);
  };

  return (
    <AppLayout title="Subscription" back>
      <Card className="space-y-2">
        <p className="label-bold text-on-surface-variant">Current plan</p>
        <p className="font-display text-3xl font-bold text-primary">{PLAN_LABEL}</p>
        <p className="text-sm text-on-surface-variant">
          One prepay payment covers 4 months — no monthly renewal to remember.
        </p>
        <p className="text-sm text-on-surface">
          Status:{" "}
          <span className="font-bold text-secondary">
            {status ? statusLabels[status] : "Account setup pending"}
          </span>
          {tenant ? (
            <span className="text-on-surface-variant"> · access through {fmtDate(tenant.nextBillingAt)}</span>
          ) : null}
        </p>
        {status === "past_due" || status === "churned" ? (
          <p className="rounded-md bg-secondary/10 px-3 py-2 text-sm font-bold text-secondary">
            New sales, stock and expenses are locked until admin confirms your payment.
          </p>
        ) : null}
      </Card>

      {renewalSoon && tenant ? (
        <Card className="space-y-sm border border-secondary/40 bg-secondary/10">
          <p className="font-bold text-secondary">
            {daysLeft != null && daysLeft <= 0
              ? "Access is due for renewal"
              : `Renewal in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
          </p>
          <button
            type="button"
            onClick={() =>
              openWhatsApp(
                renewalReminderMessage({
                  termName: state.termName,
                  school: user?.school,
                  dueLabel: fmtDate(tenant.nextBillingAt),
                }),
              )
            }
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary font-bold text-on-primary"
          >
            <Icon name="chat" /> Send renewal reminder on WhatsApp
          </button>
        </Card>
      ) : null}

      <Card className="space-y-sm">
        <h2 className="font-display text-lg font-bold text-on-surface">How to pay</h2>
        <p className="text-sm text-on-surface-variant">
          Send UGX {ugx(PLAN_PRICE_UGX)} by <span className="font-semibold text-on-surface">mobile money</span> to either
          number. Use your school name as the reason.
        </p>
        <ul className="space-y-1">
          {NUMBERS.map((n) => (
            <li key={n} className="font-mono text-base font-semibold text-on-surface">
              {n}
            </li>
          ))}
        </ul>
        <p className="text-xs text-outline">
          After paying, copy the transaction ID from the SMS and submit the form below. Admin confirms and activates your account.
        </p>
      </Card>

      <Card className="space-y-sm">
        <SectionTitle>Refer a canteen · free month</SectionTitle>
        <p className="text-center font-mono text-2xl font-bold tracking-widest text-primary">{myCode || "…"}</p>
        <button
          type="button"
          onClick={() => openWhatsApp(referralShareMessage(myCode || "SC0000"))}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-secondary-container font-bold text-on-secondary-container"
        >
          <Icon name="share" /> Share code on WhatsApp
        </button>
        {(state.referralCredits ?? 0) > 0 && (
          <div className="flex items-center justify-between gap-2 rounded-md bg-primary/10 p-sm">
            <p className="text-sm font-bold text-primary">
              {state.referralCredits} free month{(state.referralCredits ?? 0) === 1 ? "" : "s"} ready
            </p>
            <button
              type="button"
              onClick={() => {
                if (redeemReferralCredit()) {
                  setRefMsg("Free month marked — tell admin when renewing.");
                  setSaved(true);
                  setTimeout(() => setSaved(false), 2500);
                }
              }}
              className="min-h-10 rounded-md bg-primary px-3 text-xs font-bold text-on-primary"
            >
              Redeem
            </button>
          </div>
        )}
        {!state.referredByCode && (
          <div className="grid gap-sm sm:grid-cols-[1fr_auto] sm:items-end">
            <Field
              label="Have a friend's code?"
              value={refInput}
              onChange={(e) => setRefInput(e.target.value.toUpperCase())}
              placeholder="e.g. SC1A2B"
            />
            <PrimaryButton
              onClick={() => {
                const res = applyReferralCode(refInput);
                setRefMsg(res.ok ? "Code saved — you earned 1 free month." : res.error ?? "Could not apply.");
                if (res.ok) setRefInput("");
              }}
            >
              Apply
            </PrimaryButton>
          </div>
        )}
        {refMsg ? <p className="text-sm font-semibold text-primary">{refMsg}</p> : null}
      </Card>

      <div>
        <SectionTitle>Payment history</SectionTitle>
        <Card className="space-y-sm">
          {state.payments.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No payments recorded yet.</p>
          ) : (
            <ul className="divide-y divide-outline-variant/60">
              {[...state.payments]
                .sort((a, b) => b.ts - a.ts)
                .map((p) => {
                  // Admin decides: read the verdict from the shared claim record.
                  const verdict = s.paymentClaims?.find((c) => c.id === p.id)?.status;
                  const shown: "confirmed" | "dismissed" | "pending" =
                    verdict === "matched" ? "confirmed" : verdict === "dismissed" ? "dismissed" : (p.status ?? "pending");
                  return { p, shown };
                })
                .map(({ p, shown }) => (
                  <li key={p.id} className="space-y-1 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-on-surface">
                          {p.amount > 0 ? `UGX ${ugx(p.amount)}` : "Credit"}
                          <span className="ml-2 font-normal text-on-surface-variant">· {methodLabel(p.method)}</span>
                        </p>
                        <p className="text-xs text-on-surface-variant">
                          {p.operatorName || user?.name || "Operator"}
                          {p.school ? ` · ${p.school}` : ""}
                          {p.termName ? ` · ${p.termName}` : ""}
                        </p>
                        {p.transactionId ? (
                          <p className="font-mono text-xs text-on-surface">Txn ID: {p.transactionId}</p>
                        ) : null}
                        <p className="text-xs text-on-surface-variant">
                          {new Date(p.ts).toLocaleDateString("en-GB")}
                          {p.note ? ` · ${p.note}` : ""}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${
                          shown === "confirmed"
                            ? "bg-primary/15 text-primary"
                            : shown === "dismissed"
                              ? "bg-surface-high text-on-surface-variant"
                              : "bg-secondary/15 text-secondary"
                        }`}
                      >
                        {shown === "confirmed"
                          ? "Confirmed"
                          : shown === "dismissed"
                            ? "Dismissed"
                            : "Waiting for admin"}
                      </span>
                    </div>
                  </li>
                ))}
            </ul>
          )}

          <div className="space-y-sm border-t border-outline-variant pt-3">
            <p className="text-sm font-bold text-on-surface">I have paid — tell admin</p>
            <p className="text-xs text-on-surface-variant">
              Fill every field. Admin checks the transaction ID, then activates your account.
            </p>
            {formError ? <p className="text-sm font-bold text-tertiary">{formError}</p> : null}
            <div className="grid gap-sm md:grid-cols-2">
              <Field
                label="Operator name"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                placeholder="Your full name"
              />
              <Field
                label="School"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                placeholder="School name"
              />
              <Field
                label="Term you are paying for"
                value={termName}
                onChange={(e) => setTermName(e.target.value)}
                placeholder="e.g. Term 3, 2026"
              />
              <SelectField
                label="Mode of payment"
                value={method}
                onChange={(e) => setMethod(e.target.value as "mobile_money" | "cash" | "bank")}
              >
                <option value="mobile_money">Mobile money</option>
                <option value="cash">Cash</option>
                <option value="bank">Bank transfer</option>
              </SelectField>
              <Field
                label="Amount paid (UGX)"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
              />
              <Field
                label="Transaction ID"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value.trim())}
                placeholder="From MoMo SMS / receipt"
              />
              <Field
                label="Extra note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Paid from MTN line ending 3352"
              />
            </div>
            <PrimaryButton tone="cta" onClick={submitPayment}>
              Submit payment for admin to confirm
            </PrimaryButton>
            {saved ? (
              <p className="text-sm font-semibold text-primary">
                Sent. Admin will confirm the transaction ID and activate your account.
              </p>
            ) : null}
          </div>
        </Card>
      </div>

      <Saved show={saved} onUndo={() => setSaved(false)} />
    </AppLayout>
  );
}
