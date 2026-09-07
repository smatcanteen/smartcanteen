import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/Brand";
import { Icon } from "@/components/Icon";
import { homeForRole, isAdminRole, useAuth } from "@/lib/auth";
import { markFirstRunDone, myFirstRunState, setMyPin } from "@/lib/accounts.functions";
import { rememberPin } from "@/lib/pin-cache";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/first-run")({
  head: () => ({
    meta: [
      { title: "Set up your account — SmartCanteen" },
      {
        name: "description",
        content:
          "Choose your private PIN and enter your opening capital and profit target so SmartCanteen can start counting for you.",
      },
      { property: "og:title", content: "Set up your account — SmartCanteen" },
      {
        property: "og:description",
        content: "Two quick steps: your PIN, then your term capital and target.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FirstRun,
});

function FirstRun() {
  const navigate = useNavigate();
  const { user, ready, refresh } = useAuth();
  const { setCapital, saveNow } = useStore();

  const [step, setStep] = useState<1 | 2>(1);
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [termName, setTermName] = useState("Term 1");
  const [capital, setCapitalInput] = useState("");
  const [goal, setGoal] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  /** True when this account already finished setup before (e.g. PIN reset) — only the PIN step is needed. */
  const [pinOnly, setPinOnly] = useState(false);

  useEffect(() => {
    if (ready && !user) navigate({ to: "/login" });
  }, [ready, user, navigate]);

  useEffect(() => {
    if (!user) return;
    void myFirstRunState()
      .then((st) => {
        if (st.ok && st.firstRunDone) setPinOnly(true);
      })
      .catch(() => {
        /* worst case they see step 2 again */
      });
  }, [user]);

  const staff = user ? isAdminRole(user.role) : false;

  const savePin = async () => {
    setError("");
    if (!/^[A-Za-z0-9]{4,32}$/.test(pin)) {
      setError("Choose a PIN of 4 to 6 numbers.");
      return;
    }
    if (pin !== again) {
      setError("The two PINs are not the same.");
      return;
    }
    setBusy(true);
    const res = await setMyPin({ data: { pin } });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not save your PIN.");
      return;
    }
    if (user?.phone) await rememberPin(user.phone, pin, user.id);
    // The account no longer waits on a one-time password — refresh so the app
    // stops sending this person back to the start of setup.
    try {
      await refresh();
    } catch {
      /* the next page load picks it up */
    }
    if (staff || pinOnly) {
      await finish(false);
      return;
    }
    setStep(2);
  };

  const finish = async (withBook: boolean) => {
    setBusy(true);
    if (withBook) {
      setCapital(Number(capital) || 0, termName.trim() || "Term 1", Number(goal) || 0);
      // Wait for the book to reach the cloud so another phone sees the setup.
      await new Promise((r) => setTimeout(r, 60));
      try {
        await saveNow();
      } catch {
        /* stays on the device and syncs later */
      }
    }
    try {
      await markFirstRunDone();
      await refresh();
    } catch {
      /* it will be marked again next time */
    }
    setBusy(false);
    navigate({ to: user ? homeForRole(user.role) : "/" });
  };

  const saveBook = async () => {
    setError("");
    if (!termName.trim()) {
      setError("Give this term a name, for example “Term 1”.");
      return;
    }
    if (!(Number(capital) > 0)) {
      setError("Enter the money you are starting this term with.");
      return;
    }
    await finish(true);
  };

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-surface-high">
      <div className="bg-primary pb-14">
        <div className="mx-auto flex w-full max-w-[560px] items-center gap-3 px-4 pt-6">
          <BrandMark variant="dark" size="lg" />
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-on-primary">
              Welcome{user ? `, ${user.name.split(" ")[0]}` : ""}
            </p>
            <p className="truncate text-[11px] font-semibold uppercase tracking-widest text-on-primary/70">
              Two quick steps and you are ready
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto -mt-10 w-full max-w-[560px] px-3 pb-10">
        <div className="rounded-2xl bg-surface-lowest p-4 shadow-raised sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            {(pinOnly || staff ? [1] : [1, 2]).map((n) => (
              <span
                key={n}
                className={`h-2 flex-1 rounded-full ${
                  step >= n || (staff && n === 2) ? "bg-primary" : "bg-surface-high"
                }`}
              />
            ))}
          </div>

          {step === 1 ? (
            <div className="space-y-3">
              <h1 className="text-xl font-bold text-on-surface sm:text-2xl">Choose your PIN</h1>
              <p className="text-sm text-on-surface-variant">
                This replaces the one-time password you were sent. Keep it private — you will use it
                every time you open SmartCanteen, even without network.
              </p>

              <div>
                <label className="mb-1 block text-sm font-bold text-on-surface-variant" htmlFor="pin">
                  New PIN (4 or more letters or numbers)
                </label>
                <div className="relative">
                  <input
                    id="pin"
                    type={show ? "text" : "password"}
                    inputMode="text"
                    maxLength={32}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 32))}
                    className="h-12 min-h-12 w-full rounded-md border-2 border-outline-variant bg-surface-low px-3 pr-12 text-lg font-bold tracking-[0.4em] text-on-surface outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    aria-label={show ? "Hide PIN" : "Show PIN"}
                    className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-high"
                  >
                    <Icon name={show ? "visibility_off" : "visibility"} />
                  </button>
                </div>
              </div>

              <div>
                <label
                  className="mb-1 block text-sm font-bold text-on-surface-variant"
                  htmlFor="pin2"
                >
                  Type it again
                </label>
                <input
                  id="pin2"
                  type={show ? "text" : "password"}
                  inputMode="text"
                  maxLength={32}
                  value={again}
                  onChange={(e) => setAgain(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 32))}
                  className="h-12 min-h-12 w-full rounded-md border-2 border-outline-variant bg-surface-low px-3 text-lg font-bold tracking-[0.4em] text-on-surface outline-none focus:border-primary"
                />
              </div>

              {error ? (
                <p className="flex items-start gap-1 text-sm font-semibold text-tertiary">
                  <Icon name="error" className="text-[18px]" />
                  <span className="min-w-0 break-words">{error}</span>
                </p>
              ) : null}

              <button
                type="button"
                disabled={busy}
                onClick={() => void savePin()}
                className="h-12 min-h-12 w-full rounded-md bg-primary text-base font-bold text-on-primary shadow-raised disabled:opacity-60"
              >
                {busy ? "Saving…" : "Save PIN and continue"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <h1 className="text-xl font-bold text-on-surface sm:text-2xl">
                Your term capital & target
              </h1>
              <p className="text-sm text-on-surface-variant">
                Tell us the money you are starting this term with. Everything you record from now on
                is counted against it.
              </p>

              <div>
                <label className="mb-1 block text-sm font-bold text-on-surface-variant" htmlFor="term">
                  Term name
                </label>
                <input
                  id="term"
                  value={termName}
                  onChange={(e) => setTermName(e.target.value)}
                  className="h-12 min-h-12 w-full rounded-md border-2 border-outline-variant bg-surface-low px-3 font-semibold text-on-surface outline-none focus:border-primary"
                />
              </div>

              <div>
                <label
                  className="mb-1 block text-sm font-bold text-on-surface-variant"
                  htmlFor="capital"
                >
                  Money you are starting with (UGX)
                </label>
                <input
                  id="capital"
                  inputMode="numeric"
                  value={capital}
                  onChange={(e) => setCapitalInput(e.target.value.replace(/\D/g, ""))}
                  placeholder="500000"
                  className="h-12 min-h-12 w-full rounded-md border-2 border-outline-variant bg-surface-low px-3 font-semibold text-on-surface outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-bold text-on-surface-variant" htmlFor="goal">
                  Profit target for the term (UGX) — optional
                </label>
                <input
                  id="goal"
                  inputMode="numeric"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value.replace(/\D/g, ""))}
                  placeholder="900000"
                  className="h-12 min-h-12 w-full rounded-md border-2 border-outline-variant bg-surface-low px-3 font-semibold text-on-surface outline-none focus:border-primary"
                />
              </div>

              {error ? (
                <p className="flex items-start gap-1 text-sm font-semibold text-tertiary">
                  <Icon name="error" className="text-[18px]" />
                  <span className="min-w-0 break-words">{error}</span>
                </p>
              ) : null}

              <button
                type="button"
                disabled={busy}
                onClick={() => void saveBook()}
                className="h-12 min-h-12 w-full rounded-md bg-primary text-base font-bold text-on-primary shadow-raised disabled:opacity-60"
              >
                {busy ? "Setting up…" : "Start using SmartCanteen"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
