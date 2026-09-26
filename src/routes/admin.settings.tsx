import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, Field, PrimaryButton, SectionTitle } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import { ugxDisplay, usePlatform } from "@/lib/platform";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [{ title: "Settings — SmartCanteen Admin" }],
  }),
  component: AdminSettings,
});

function AdminSettings() {
  const { user } = useAuth();
  const { s, updateSettings, logAction } = usePlatform();
  const [saved, setSaved] = useState(false);
  const [f, setF] = useState({
    priceUGX: String(s.settings.priceUGX),
    months: String(s.settings.months),
    signupBonus: String(s.settings.signupBonus),
    trailPct: String(s.settings.trailPct),
    clawbackDays: String(s.settings.clawbackDays),
    welcomeTemplate: s.settings.welcomeTemplate,
    leaderboard: s.settings.leaderboard,
  });

  const save = () => {
    updateSettings({
      priceUGX: Number(f.priceUGX) || 35000,
      months: Number(f.months) || 4,
      signupBonus: Number(f.signupBonus) || 0,
      trailPct: Number(f.trailPct) || 0,
      clawbackDays: Number(f.clawbackDays) || 60,
      welcomeTemplate: f.welcomeTemplate,
      leaderboard: f.leaderboard,
    });
    logAction(user?.name ?? "admin", "Updated platform billing settings");
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-primary">Configuration</p>
        <h1 className="text-2xl font-extrabold text-on-surface sm:text-3xl">Platform settings</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Plan price, agent bonuses and the welcome message sent to new operators.
        </p>
      </div>

      <Card className="space-y-sm">
        <SectionTitle>Subscription plan</SectionTitle>
        <div className="grid gap-sm sm:grid-cols-2">
          <Field
            label="Price (UGX)"
            inputMode="numeric"
            value={f.priceUGX}
            onChange={(e) => setF({ ...f, priceUGX: e.target.value })}
            hint={`Shown to operators as UGX ${ugxDisplay(Number(f.priceUGX) || 0)}`}
          />
          <Field
            label="Months covered per payment"
            inputMode="numeric"
            value={f.months}
            onChange={(e) => setF({ ...f, months: e.target.value })}
          />
        </div>
      </Card>

      <Card className="space-y-sm">
        <SectionTitle>Field agent commissions</SectionTitle>
        <div className="grid gap-sm sm:grid-cols-3">
          <Field
            label="Signup bonus (UGX)"
            inputMode="numeric"
            value={f.signupBonus}
            onChange={(e) => setF({ ...f, signupBonus: e.target.value })}
          />
          <Field
            label="Trail % of each paid renew"
            inputMode="numeric"
            value={f.trailPct}
            onChange={(e) => setF({ ...f, trailPct: e.target.value })}
          />
          <Field
            label="Clawback window (days)"
            inputMode="numeric"
            value={f.clawbackDays}
            onChange={(e) => setF({ ...f, clawbackDays: e.target.value })}
            hint="Signup bonus reverses if the school churns inside this window."
          />
        </div>
        <label className="flex items-center gap-2 text-sm font-bold text-on-surface-variant">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={f.leaderboard}
            onChange={(e) => setF({ ...f, leaderboard: e.target.checked })}
          />
          Show agent leaderboard
        </label>
      </Card>

      <Card className="space-y-sm">
        <SectionTitle>Welcome message template</SectionTitle>
        <p className="text-xs text-on-surface-variant">
          Placeholders: {"{name}"} {"{phone}"} {"{password}"} {"{email}"} {"{link}"} {"{school}"}
        </p>
        <textarea
          rows={5}
          value={f.welcomeTemplate}
          onChange={(e) => setF({ ...f, welcomeTemplate: e.target.value })}
          className="w-full rounded-md border-2 border-outline-variant bg-surface-lowest p-3 text-sm text-on-surface"
        />
      </Card>

      <PrimaryButton onClick={save}>{saved ? "Saved" : "Save settings"}</PrimaryButton>
    </>
  );
}
