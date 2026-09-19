import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout, Saved } from "@/components/AppLayout";
import { Card, Field, PrimaryButton, SectionTitle } from "@/components/ui-kit";
import { ugx, useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { effectiveTenantStatus, fmtDate, statusLabels, usePlatform } from "@/lib/platform";

export const Route = createFileRoute("/subscription")({
  head: () => ({
    meta: [
      { title: "Subscription — SmartCanteen" },
      {
        name: "description",
        content:
          "One prepay payment of UGX 35,000 covers four months of SmartCanteen — see your plan, how to pay and your payment history.",
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
  const { state, addPayment } = useStore();
  const { user } = useAuth();
  const { s } = usePlatform();
  const tenant = s.tenants.find((item) => item.accountId === user?.id);
  const status = tenant ? effectiveTenantStatus(tenant) : null;
  const readOnly = status === "past_due" || status === "churned";
  const [amount, setAmount] = useState("35000");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);

  return (
    <AppLayout title="Subscription" back>
      <Card className="space-y-2">
        <p className="label-bold text-on-surface-variant">Current plan</p>
        <p className="font-display text-3xl font-bold text-primary">UGX 35,000 for 4 months</p>
        <p className="text-sm text-on-surface-variant">
          One prepay payment covers 4 months — no monthly renewal to remember.
        </p>
        <p className="text-sm text-on-surface">
          Status: <span className="font-bold text-secondary">{status ? statusLabels[status] : "Account setup pending"}</span>
          {tenant ? <span className="text-on-surface-variant"> · access through {fmtDate(tenant.nextBillingAt)}</span> : null}
        </p>
        {readOnly ? (
          <p className="rounded-md bg-secondary/10 px-3 py-2 text-sm font-bold text-secondary">
            New sales, stock and expenses are locked. Your reports and past records remain available.
          </p>
        ) : null}
      </Card>

      <Card className="space-y-sm">
        <h2 className="font-display text-lg font-bold text-on-surface">How to pay</h2>
        <p className="text-sm text-on-surface-variant">
          Send UGX 35,000 to either number below, using your canteen name (
          <span className="font-semibold text-on-surface">{state.termName}</span>) as the reference.
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
                    <p className="text-sm font-bold text-on-surface">UGX {ugx(p.amount)}</p>
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

          {readOnly ? <p className="text-sm font-bold text-secondary">Send payment using the instructions above. Admin will restore full access after confirming it.</p> : null}
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
