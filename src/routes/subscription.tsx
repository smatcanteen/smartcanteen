import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout, Saved } from "@/components/AppLayout";
import { Icon } from "@/components/Icon";
import { Card, Field, PrimaryButton, SectionTitle } from "@/components/ui-kit";
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
  const readOnly = status === "past_due" || status === "churned";
  const [amount, setAmount] = useState(String(PLAN_PRICE_UGX));
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [refInput, setRefInput] = useState("");
  const [refMsg, setRefMsg] = useState("");
  const [myCode, setMyCode] = useState(state.referralCode ?? "");

  useEffect(() => {
    const code = ensureReferralCode(user?.id ?? null);
    setMyCode(code);
  }, [user?.id, ensureReferralCode]);

  const daysLeft = tenant
    ? Math.ceil((new Date(tenant.nextBillingAt).getTime() - Date.now()) / 86_400_000)
    : null;
  const renewalSoon = daysLeft != null && daysLeft <= 14;

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
        {readOnly ? (
          <p className="rounded-md bg-secondary/10 px-3 py-2 text-sm font-bold text-secondary">
            New sales, stock and expenses are locked. Your reports and past records remain available.
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
          <p className="text-sm text-on-surface-variant">
            Send a WhatsApp reminder to yourself or your school admin with the pay details.
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
          Send UGX {ugx(PLAN_PRICE_UGX)} to either number below, using your canteen name (
          <span className="font-semibold text-on-surface">{state.termName || user?.school || "your canteen"}</span>) as
          the reference.
        </p>
        <ul className="space-y-1">
          {NUMBERS.map((n) => (
            <li key={n} className="font-mono text-base font-semibold text-on-surface">
              {n}
            </li>
          ))}
        </ul>
        <p className="text-xs text-outline">
          After paying, forward the confirmation message to us. Your account is updated the same day.
        </p>
      </Card>

      <Card className="space-y-sm">
        <SectionTitle>Refer a canteen · free month</SectionTitle>
        <p className="text-sm text-on-surface-variant">
          Share your code. When another canteen subscribes with it, you both get a free month credit.
        </p>
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
                  setRefMsg("Free month marked as redeemed — tell admin when renewing.");
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
        {state.referredByCode && (
          <p className="text-xs text-on-surface-variant">Joined with code {state.referredByCode}.</p>
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
              {state.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-bold text-on-surface">
                      {p.amount > 0 ? `UGX ${ugx(p.amount)}` : "Credit"}
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      {new Date(p.ts).toLocaleDateString()} {p.note ? `· ${p.note}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-primary-container/15 px-2 py-1 text-xs font-bold text-primary">
                    Recorded
                  </span>
                </li>
              ))}
            </ul>
          )}

          {readOnly ? (
            <p className="text-sm font-bold text-secondary">
              Send payment using the instructions above. Admin will restore full access after confirming it.
            </p>
          ) : null}
          <div className="grid gap-sm pt-2 md:grid-cols-2">
            <Field
              label="Record a payment (UGX)"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Field
              label="Reference / note"
              placeholder="MTN confirmation code"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <PrimaryButton
            tone="cta"
            disabled={readOnly}
            onClick={() => {
              const v = Number(amount) || 0;
              if (!v) return;
              addPayment(v, note.trim());
              setNote("");
              setSaved(true);
              setTimeout(() => setSaved(false), 2500);
            }}
          >
            Add to payment history
          </PrimaryButton>
        </Card>
      </div>

      <Saved show={saved} onUndo={() => setSaved(false)} />
    </AppLayout>
  );
}
