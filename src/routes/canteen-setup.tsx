import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { BrandMark } from "@/components/Brand";
import { Card, Field, PrimaryButton } from "@/components/ui-kit";
import { ugx, useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/canteen-setup")({
  head: () => ({
    meta: [
      { title: "Set up your canteen — SmartCanteen" },
      {
        name: "description",
        content:
          "Name the term, enter the opening cash you are starting with and carry forward money left from last term.",
      },
      { property: "og:title", content: "Set up your canteen — SmartCanteen" },
      {
        property: "og:description",
        content: "Start your term with the right opening balance so every figure after it is correct.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CanteenSetup,
});

function CanteenSetup() {
  const { setCapital, saveNow } = useStore();
  const { user } = useAuth();
  const navigate = useNavigate();

  const year = new Date().getFullYear();
  const [term, setTerm] = useState(`Term 1, ${year}`);
  const [opening, setOpening] = useState("");
  const [carry, setCarry] = useState("");
  const [goal, setGoal] = useState("");
  const [error, setError] = useState("");

  const total = (Number(opening) || 0) + (Number(carry) || 0);

  const finish = async () => {
    if (!term.trim()) return setError("Give this term a name, e.g. Term 1, 2026.");
    if (total <= 0) return setError("Enter the cash you are starting the term with.");
    setError("");
    setCapital(total, term.trim(), Number(goal) || Math.round(total * 2));
    await new Promise((r) => setTimeout(r, 60));
    try {
      await saveNow();
    } catch {
      /* stays on the device and syncs later */
    }
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-surface-high px-3 py-6 sm:px-4">
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-md">
        <div className="flex items-center gap-3">
          <BrandMark size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-on-surface sm:text-2xl">
              Welcome{user ? `, ${user.name.split(" ")[0]}` : ""}
            </h1>
            <p className="text-sm text-on-surface-variant">
              Let's open your cash book for {user?.school || "your canteen"}.
            </p>
          </div>
        </div>

        <Card className="space-y-sm">
          <p className="text-sm text-on-surface-variant">
            Your account is empty on purpose — everything you see from now on is your own money.
            Start by telling us what you have in hand today.
          </p>
          <Field
            label="Term name"
            placeholder={`Term 1, ${year}`}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            hint="Reports and profit are grouped by term."
          />
          <Field
            label="Opening cash for this term (UGX)"
            inputMode="numeric"
            placeholder="e.g. 500000"
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
            hint="Money you or your boss is putting into the shop now."
          />
          <Field
            label="Cash carried forward from last term (UGX)"
            inputMode="numeric"
            placeholder="0"
            value={carry}
            onChange={(e) => setCarry(e.target.value)}
            hint="Leave at 0 if this is your first term on SmartCanteen."
          />
          <Field
            label="Target to reach by term end (UGX)"
            inputMode="numeric"
            placeholder="optional"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            hint="Leave blank and we set double your opening cash."
          />
        </Card>

        <Card className="flex items-center justify-between gap-3">
          <div>
            <p className="label-bold text-on-surface-variant">Opening Cash at Hand</p>
            <p className="price-display text-primary">UGX {ugx(total)}</p>
          </div>
          <Icon name="account_balance_wallet" className="text-[32px] text-primary" />
        </Card>

        {error ? (
          <p className="flex items-center gap-1 text-sm font-semibold text-tertiary">
            <Icon name="error" className="text-[18px]" /> {error}
          </p>
        ) : null}

        <PrimaryButton tone="cta" onClick={() => void finish()}>
          Start the term <Icon name="arrow_forward" />
        </PrimaryButton>
      </div>
    </div>
  );
}
