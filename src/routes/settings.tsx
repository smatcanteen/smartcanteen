import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { AppLayout, Saved } from "@/components/AppLayout";
import { AccountAvatar, useAccountLogo } from "@/components/Brand";
import { Icon } from "@/components/Icon";
import { Card, Field, PrimaryButton, SectionTitle, SelectField } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import { setMyPin } from "@/lib/accounts.functions";
import { useStore, type State } from "@/lib/store";


export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — SmartCanteen" },
      {
        name: "description",
        content:
          "Set a privacy PIN with auto-lock, download a backup of your cash book, restore from a file, or clear all data.",
      },
      { property: "og:title", content: "Settings — SmartCanteen" },
      {
        property: "og:description",
        content: "Privacy lock, backup and restore for your canteen cash book.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const {
    state,
    setPin,
    restoreState,
    clearAll,
    setTheme,
    setFontScale,
    addExpenseCategory,
    removeExpenseCategory,
    upsertStaff,
    removeStaff,
    activeStaff,
  } = useStore();
  const [newCat, setNewCat] = useState("");
  const [newIcon, setNewIcon] = useState("smartphone");
  const [pin, setPinValue] = useState("");
  const [lock, setLock] = useState(String(state.autoLockMin));
  const [saved, setSaved] = useState(false);
  const [savingPin, setSavingPin] = useState(false);
  const [error, setError] = useState("");
  const [staffName, setStaffName] = useState("");
  const [staffPin, setStaffPin] = useState("");
  const [staffMsg, setStaffMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { logo, setLogo } = useAccountLogo(user?.id);


  const flash = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const download = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `smartcanteen-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const restore = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as State;
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.txs)) {
        throw new Error("bad file");
      }
      restoreState(parsed);
      setError("");
      flash();
    } catch {
      setError("That file isn't a SmartCanteen backup.");
    }
  };

  return (
    <AppLayout title="More" back>
      <div>
        <SectionTitle>Daily is on Home — this is everything else</SectionTitle>
        <Card className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
          {[
            { to: "/debtors", icon: "group", label: "Student credit" },
            { to: "/report", icon: "bar_chart", label: "Reports" },
            { to: "/history", icon: "history", label: "History" },
            { to: "/term-capital", icon: "account_balance", label: "Opening money" },
            { to: "/term-transition", icon: "event_repeat", label: "Close term" },
            { to: "/subscription", icon: "card_membership", label: "Plan & pay" },
            { to: "/support", icon: "support_agent", label: "Help" },
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-md bg-surface-low text-center text-sm font-bold text-on-surface"
            >
              <Icon name={item.icon} className="text-primary" />
              {item.label}
            </Link>
          ))}
        </Card>
        <p className="mt-2 text-xs text-on-surface-variant">
          Sale, Stock, Expense and Close stay on Home so the daily path stays short.
        </p>
      </div>

      <div>
        <SectionTitle>Canteen logo</SectionTitle>
        <Card className="flex flex-wrap items-center gap-sm">
          <AccountAvatar name={user?.name ?? "SmartCanteen"} logo={logo} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-on-surface">
              {logo ? "Your logo shows in the app header." : "Add a logo for your canteen."}
            </p>
            <p className="text-xs text-on-surface-variant">Square PNG or JPG, kept on this device.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => logoRef.current?.click()}
              className="min-h-11 rounded-full border-2 border-outline-variant px-4 text-sm font-bold text-on-surface-variant"
            >
              {logo ? "Change" : "Upload"}
            </button>
            {logo ? (
              <button
                onClick={() => setLogo(null)}
                className="min-h-11 rounded-full px-4 text-sm font-bold text-tertiary"
              >
                Remove
              </button>
            ) : null}
          </div>
          <input
            ref={logoRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (file.size > 600_000) {
                setError("That image is too large — pick one under 600 KB.");
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                setLogo(String(reader.result));
                setError("");
                flash();
              };
              reader.readAsDataURL(file);
            }}
          />
        </Card>
      </div>

      <div>

        <SectionTitle>PIN lock (hide money)</SectionTitle>
        <Card className="space-y-sm">
          <p className="text-sm text-on-surface-variant">
            {state.pin ? (
              <>
                A PIN is set. Your money is hidden until it&apos;s entered.
              </>
            ) : (
              <>
                <span className="font-bold text-secondary">No PIN set.</span> Add one to hide your
                money from prying eyes.
              </>
            )}
          </p>

          <div className="grid gap-sm md:grid-cols-2">
            <Field
              label="New PIN"
              type="password"
              inputMode="text"
              maxLength={32}
              value={pin}
              onChange={(e) => setPinValue(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 32))}
            />
            <Field
              label="Auto-lock (min)"
              inputMode="numeric"
              value={lock}
              onChange={(e) => setLock(e.target.value)}
            />
          </div>

          <div className="grid gap-sm md:grid-cols-2">
            <PrimaryButton
              tone="cta"
              disabled={pin.length < 4 || savingPin}
              onClick={async () => {
                setSavingPin(true);
                setPin(pin, Number(lock) || 5);
                const res = await setMyPin({ data: { pin } });
                setSavingPin(false);
                if (!res.ok) {
                  setError(res.error ?? "Could not save that PIN.");
                  return;
                }
                setError("");
                setPinValue("");
                flash();
              }}
            >
              <Icon name="lock" className="text-[20px]" />
              {savingPin ? "Saving…" : "Set PIN"}
            </PrimaryButton>
            <button
              type="button"
              onClick={() => {
                setPin(null, Number(lock) || 5);
                setPinValue("");
                flash();
              }}
              className="flex h-12 w-full items-center justify-center rounded-md border-2 border-outline-variant bg-surface-container text-base font-bold text-on-surface transition-colors hover:bg-surface-high"
            >
              Remove PIN
            </button>
          </div>
          <p className="text-xs text-outline">
            PIN must be 4–6 digits. It replaces the one-time password you were sent, so keep it private.
          </p>
        </Card>
      </div>

      <div>
        <SectionTitle>Appearance &amp; accessibility</SectionTitle>
        <Card className="space-y-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold text-on-surface-variant">Dark mode</span>
            <button
              type="button"
              role="switch"
              aria-checked={state.theme === "dark"}
              onClick={() => setTheme(state.theme === "dark" ? "light" : "dark")}
              className={`flex h-11 min-h-11 items-center gap-2 rounded-full px-4 text-sm font-bold ${
                state.theme === "dark" ? "bg-primary text-on-primary" : "bg-surface-high text-on-surface"
              }`}
            >
              <Icon name={state.theme === "dark" ? "dark_mode" : "light_mode"} className="text-[20px]" />
              {state.theme === "dark" ? "On" : "Off"}
            </button>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-on-surface-variant">
              Text size — {Math.round(state.fontScale * 100)}%
            </span>
            <input
              type="range"
              min={0.9}
              max={1.4}
              step={0.05}
              value={state.fontScale}
              onChange={(e) => setFontScale(Number(e.target.value))}
              className="w-full accent-[#2f6b46]"
              aria-label="Text size"
            />
          </label>
          <p className="text-xs text-on-surface-variant">
            Larger text scales the whole app, keeps tap targets at least 44px and works with screen readers.
          </p>
        </Card>
      </div>

      <div>
        <SectionTitle>Expense categories</SectionTitle>
        <Card className="space-y-sm">
          <div className="flex flex-wrap gap-2">
            {state.expenseCategories.map((c) => (
              <span
                key={c.id}
                className="flex min-h-11 items-center gap-2 rounded-full bg-surface-high px-3 text-sm font-semibold text-on-surface"
              >
                <Icon name={c.icon} className="text-[18px] text-primary" />
                {c.label}
                <button
                  type="button"
                  onClick={() => removeExpenseCategory(c.id)}
                  aria-label={`Remove ${c.label}`}
                  className="text-tertiary"
                >
                  <Icon name="close" className="text-[18px]" />
                </button>
              </span>
            ))}
          </div>
          <div className="grid gap-sm sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field
              label="New category"
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              placeholder="e.g. Airtime"
            />
            <SelectField label="Icon" value={newIcon} onChange={(e) => setNewIcon(e.target.value)}>
              {["smartphone", "wifi", "local_shipping", "bolt", "water_drop", "restaurant", "handyman", "home_work", "badge", "shopping_bag", "more_horiz"].map(
                (i) => (
                  <option key={i} value={i}>
                    {i.replace(/_/g, " ")}
                  </option>
                ),
              )}
            </SelectField>
            <PrimaryButton
              disabled={!newCat.trim()}
              onClick={() => {
                addExpenseCategory(newCat.trim(), newIcon);
                setNewCat("");
                flash();
              }}
            >
              <Icon name="add" /> Add
            </PrimaryButton>
          </div>
          <p className="text-xs text-on-surface-variant">
            New categories appear on the Expense screen and get their own quick-pay page.
          </p>
        </Card>
      </div>

      <div>
        <SectionTitle>Backup &amp; restore</SectionTitle>
        <Card className="space-y-sm">
          <button
            type="button"
            onClick={download}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-md border border-outline-variant bg-surface-container text-base font-semibold text-on-surface transition-colors hover:bg-surface-high"
          >
            <Icon name="download" className="text-[20px]" />
            Download backup (JSON)
          </button>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-md border border-outline-variant bg-surface-container text-base font-semibold text-on-surface transition-colors hover:bg-surface-high"
          >
            <Icon name="upload" className="text-[20px]" />
            Restore from file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void restore(f);
              e.target.value = "";
            }}
          />

          <button
            type="button"
            onClick={() => {
              if (confirm("Clear all cash book data? This cannot be undone.")) {
                clearAll();
                flash();
              }
            }}
            className="flex h-12 w-full items-center justify-center rounded-md bg-error text-base font-bold text-on-error shadow-raised transition-all active:scale-[0.98]"
          >
            Clear all cash book data
          </button>

          {error ? <p className="text-sm font-semibold text-error">{error}</p> : null}
          <p className="text-xs text-outline">
            Backups are plain JSON files kept on your own device — keep one after every term close.
          </p>
        </Card>
      </div>

      <Saved show={saved} onUndo={() => setSaved(false)} />
    </AppLayout>
  );
}
