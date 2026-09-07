import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { BrandMark } from "@/components/Brand";
import { homeForRole, useAuth, type Role } from "@/lib/auth";
import { myFirstRunState } from "@/lib/accounts.functions";
import { checkCachedPin, forgetPhone, lastPhone, rememberPhone, rememberPin } from "@/lib/pin-cache";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — SmartCanteen Operators & Admin" },
      {
        name: "description",
        content:
          "One secure login for canteen operators, field agents and the SmartCanteen team. Unlock with your PIN or sign in with your phone number and password.",
      },
      { property: "og:title", content: "Log in — SmartCanteen" },
      {
        property: "og:description",
        content: "Every shilling in and out of your canteen — counted for you.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Login,
});

const highlights = [
  {
    icon: "receipt_long",
    title: "Sales & expenses in seconds",
    body: "Tap a category, type the amount, done — no paper book.",
  },
  {
    icon: "group",
    title: "Student credit tracked",
    body: "Know who owes you, how much and since when.",
  },
  {
    icon: "account_balance_wallet",
    title: "Cash at hand, always right",
    body: "Daily opening, closing and cumulative balance calculated for you.",
  },
  {
    icon: "bar_chart",
    title: "Term reports & exports",
    body: "Profit by term, Excel and PDF for the school office.",
  },
];

/** Local part of a Ugandan number: 9 digits after the +256 prefix. */
const localDigits = (v: string) => v.replace(/\D/g, "").replace(/^0+/, "").slice(0, 9);
const fullPhone = (local: string) => `256${local}`;

function Login() {
  const navigate = useNavigate();
  const { login, loginWithPin, requestHelp, user, ready } = useAuth();

  const [tab, setTab] = useState<"pin" | "password">("pin");
  const [phone, setPhone] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [mode, setMode] = useState<"phone" | "email">("phone");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);

  // Someone who already signed in on this phone only needs their PIN.
  useEffect(() => {
    setSaved(lastPhone());
  }, []);

  /** The number this sign-in will use: the remembered one, or what is typed. */
  const activePhone = () => (tab === "pin" && saved ? saved : fullPhone(localDigits(phone)));
  /** PIN unlock always uses the number this phone already remembers. */
  const phoneReady = () => (tab === "pin" ? !!saved : localDigits(phone).length === 9);

  useEffect(() => {
    if (ready && user) navigate({ to: homeForRole(user.role) });
  }, [ready, user, navigate]);


  /** Send people who have not finished setting up to the guided first-run screen. */
  const goHome = async (role: Role) => {
    try {
      const st = await myFirstRunState();
      // New accounts get the full setup; reset accounts only owe a new PIN,
      // which the first-run screen now handles on its own.
      if (st.ok && (!st.firstRunDone || st.otpPending)) {
        navigate({ to: "/first-run" });
        return;
      }
    } catch {
      /* offline — go straight in */
    }
    navigate({ to: homeForRole(role) });
  };

  const submitPin = async () => {
    setError("");
    setNotice("");
    if (!phoneReady()) {
      setError(
        'This phone does not remember you yet. Use the "Phone/Email + password" tab once, then PIN unlock works here.',
      );
      return;
    }
    if (!/^[A-Za-z0-9]{4,32}$/.test(pin)) {
      setError("Your PIN is 4 or more letters or numbers.");
      return;
    }
    setBusy(true);
    const number = activePhone();

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      const ok = await checkCachedPin(number, pin);
      setBusy(false);
      if (ok) {
        navigate({ to: "/" });
        return;
      }
      setError("You are offline and that PIN does not match the one saved on this phone.");
      return;
    }

    const res = await loginWithPin(number, pin);
    if (!res.ok && res.error?.startsWith("No PIN set yet")) {
      // A newly created or reset account has no saved PIN yet. Let the same
      // field accept the one-time password so the operator does not need to
      // discover and switch to the second login tab.
      let passwordRes = await login(number, pin);
      if (!passwordRes.ok && pin !== pin.toUpperCase()) {
        passwordRes = await login(number, pin.toUpperCase());
      }
      setBusy(false);
      if (!passwordRes.ok) {
        setError("That one-time password is not correct. Check the latest message from your administrator.");
        return;
      }
      rememberPhone(number);
      await goHome(passwordRes.role ?? "operator");
      return;
    }
    setBusy(false);
    if (!res.ok) {
      setLocked(!!res.locked);
      setError(res.error ?? "Could not unlock.");
      return;
    }
    setLocked(false);
    await rememberPin(number, pin, "me");
    rememberPhone(number);
    await goHome(res.role ?? "operator");
  };

  const submitPassword = async () => {
    setError("");
    setNotice("");
    const identifier = mode === "email" ? email.trim() : fullPhone(localDigits(phone));
    if (mode === "phone" && localDigits(phone).length < 9) {
      setError("Enter your 9-digit phone number after +256.");
      return;
    }
    if (mode === "email" && !identifier.includes("@")) {
      setError("Enter the email address you were given.");
      return;
    }
    if (!password) {
      setError("Enter your password or the one-time password you were sent.");
      return;
    }
    setBusy(true);
    const typed = password.trim();
    let res = await login(identifier, typed);
    // One-time passwords are issued in capitals; accept them typed in any case.
    if (!res.ok && typed !== typed.toUpperCase()) {
      res = await login(identifier, typed.toUpperCase());
    }
    setBusy(false);

    if (!res.ok) {
      setError(res.error ?? "Could not sign you in.");
      return;
    }
    if (mode === "phone") rememberPhone(identifier);
    await goHome(res.role ?? "operator");
  };

  const askForHelp = async (what: "PIN" | "password") => {
    if (!phoneReady()) {
      setError(`Type your phone number first, then tap "Forgot ${what}".`);
      return;
    }
    setBusy(true);
    await requestHelp(activePhone());
    setBusy(false);
    setError("");
    setNotice(
      `We have told the administrator. They will send you a new one-time ${what.toLowerCase()} on WhatsApp.`,
    );
  };

  /** "Not you?" — forget the remembered number and ask for a new one. */
  const useAnotherNumber = () => {
    forgetPhone();
    setSaved(null);
    setPhone("");
    setPin("");
    setError("");
    setNotice("");
    // PIN unlock needs a remembered number, so send them to the password tab.
    setTab("password");
  };



  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-surface-high">
      {/* Green band — the same header language as the operator dashboard */}
      <div className="bg-primary pb-16 md:hidden">
        <div className="mx-auto flex w-full max-w-[560px] items-center gap-3 px-4 pt-6">
          <BrandMark variant="dark" size="lg" />
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-on-primary">
              Smart<span className="text-secondary-container">Canteen</span>
            </p>
            <p className="truncate text-[11px] font-semibold uppercase tracking-widest text-on-primary/70">
              The smarter way to run your canteen
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto -mt-12 w-full max-w-5xl px-3 pb-8 md:mt-0 md:px-6 md:py-8">
        <div className="grid w-full overflow-hidden rounded-2xl shadow-raised md:grid-cols-2">
          {/* Login form */}
          <div className="flex min-w-0 flex-col bg-surface-lowest p-4 sm:p-6 md:p-10">
            <div className="hidden items-center gap-2 md:flex">
              <BrandMark size="md" />
              <div className="min-w-0">
                <p className="text-lg font-bold text-secondary">
                  Smart<span className="text-primary">Canteen</span>
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
                  The smarter way to run your canteen
                </p>
              </div>
            </div>

            <div className="my-auto space-y-4 py-4 md:py-8">
              <div className="text-center">
                <h1 className="text-2xl font-bold text-on-surface sm:text-3xl">Welcome back</h1>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Operators, field agents and admin sign in here.
                </p>
              </div>

              {/* Two ways in */}
              <div
                role="tablist"
                aria-label="How would you like to sign in?"
                className="grid grid-cols-2 gap-1 rounded-full bg-surface-high p-1"
              >
                {(
                  [
                    ["pin", "Login with PIN"],
                    ["password", "Phone/Email + password"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => {
                      setTab(key);
                      setError("");
                      setNotice("");
                    }}
                    className={`min-h-11 min-w-0 truncate rounded-full px-1.5 text-[11px] font-bold sm:px-2 transition-colors sm:text-sm ${
                      tab === key
                        ? "bg-primary text-on-primary shadow-raised"
                        : "text-on-surface-variant"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (busy) return;
                  void (tab === "pin" ? submitPin() : submitPassword());
                }}
              >
                {/* Already signed in on this phone: just the PIN, no number to retype */}
                {tab === "pin" && saved && (
                  <div className="flex items-center justify-between gap-2 rounded-md bg-surface-high px-3 py-2">
                    <span className="min-w-0 truncate text-sm font-semibold text-on-surface">
                      Signing in as +{saved}
                    </span>
                    <button
                      type="button"
                      onClick={useAnotherNumber}
                      className="shrink-0 text-sm font-bold text-primary"
                    >
                      Not you?
                    </button>
                  </div>
                )}

                {/* Phone number with a fixed country code */}
                {((tab === "pin" && !saved) || (tab === "password" && mode === "phone")) && (
                  <div>
                    <label
                      className="mb-1 block text-sm font-bold text-on-surface-variant"
                      htmlFor="phone"
                    >
                      Phone number
                    </label>
                    <div className="flex h-12 min-h-12 w-full items-center overflow-hidden rounded-md border-2 border-outline-variant bg-surface-low focus-within:border-primary">
                      <span
                        aria-hidden="true"
                        className="flex h-full shrink-0 items-center border-r-2 border-outline-variant bg-surface-high px-2 text-sm font-bold text-on-surface-variant sm:px-3"
                      >
                        +256
                      </span>
                      <input
                        id="phone"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        value={phone}
                        onChange={(e) => setPhone(localDigits(e.target.value))}
                        placeholder="772 000 000"
                        aria-describedby="phone-help"
                        className="h-full w-full min-w-0 bg-transparent px-2 font-semibold tracking-wide text-on-surface outline-none sm:px-3"
                      />
                    </div>
                    <span id="phone-help" className="mt-1 block text-xs text-on-surface-variant">
                      Leave out the first 0 — just the nine numbers after +256.
                    </span>
                  </div>
                )}


                {tab === "pin" ? (
                  <div>
                    <label
                      className="mb-1 block text-sm font-bold text-on-surface-variant"
                      htmlFor="pin"
                    >
                      Your PIN
                    </label>
                    <div className="relative">
                      <input
                        id="pin"
                        type={showPin ? "text" : "password"}
                        inputMode="text"
                        autoComplete="one-time-code"
                        maxLength={32}
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 32))}
                        placeholder="••••"
                        className="h-12 min-h-12 w-full rounded-md border-2 border-outline-variant bg-surface-low px-3 pr-12 text-lg font-bold tracking-[0.4em] text-on-surface outline-none focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPin((v) => !v)}
                        aria-label={showPin ? "Hide PIN" : "Show PIN"}
                        className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-high"
                      >
                        <Icon name={showPin ? "visibility_off" : "visibility"} />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => askForHelp("PIN")}
                      className="mt-1 min-h-11 text-sm font-bold text-primary underline"
                    >
                      Forgot PIN?
                    </button>
                  </div>
                ) : (
                  <>
                    {mode === "email" && (
                      <div>
                        <label
                          className="mb-1 block text-sm font-bold text-on-surface-variant"
                          htmlFor="email"
                        >
                          Email address
                        </label>
                        <input
                          id="email"
                          type="email"
                          autoComplete="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@smartcanteen.app"
                          className="h-12 min-h-12 w-full rounded-md border-2 border-outline-variant bg-surface-low px-3 font-semibold text-on-surface outline-none focus:border-primary"
                        />
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setMode((m) => (m === "phone" ? "email" : "phone"));
                        setError("");
                      }}
                      className="min-h-11 text-sm font-bold text-primary underline"
                    >
                      {mode === "phone" ? "Use an email address instead" : "Use a phone number instead"}
                    </button>

                    <div>
                      <label
                        className="mb-1 block text-sm font-bold text-on-surface-variant"
                        htmlFor="password"
                      >
                        Password or one-time password
                      </label>
                      <div className="relative">
                        <input
                          id="password"
                          type={show ? "text" : "password"}
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="h-12 min-h-12 w-full rounded-md border-2 border-outline-variant bg-surface-low px-3 pr-12 font-semibold text-on-surface outline-none focus:border-primary"
                        />
                        <button
                          type="button"
                          onClick={() => setShow((s) => !s)}
                          aria-label={show ? "Hide password" : "Show password"}
                          className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-high"
                        >
                          <Icon name={show ? "visibility_off" : "visibility"} />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => askForHelp("password")}
                        className="mt-1 min-h-11 text-sm font-bold text-primary underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                  </>
                )}

                {error ? (
                  <p className="flex items-start gap-1 text-sm font-semibold text-tertiary">
                    <Icon name="error" className="text-[18px]" />
                    <span className="min-w-0 break-words">{error}</span>
                  </p>
                ) : null}
                {notice ? (
                  <p className="flex items-start gap-1 rounded-md bg-secondary-container/40 p-2 text-sm font-semibold text-on-surface">
                    <Icon name="check_circle" className="text-[18px]" />
                    <span className="min-w-0 break-words">{notice}</span>
                  </p>
                ) : null}
                {locked ? (
                  <button
                    type="button"
                    onClick={() => askForHelp("PIN")}
                    className="min-h-12 w-full rounded-md border-2 border-tertiary text-sm font-bold text-tertiary"
                  >
                    Ask the administrator to reset my PIN
                  </button>
                ) : null}

                <button
                  type="submit"
                  disabled={busy}
                  className="flex h-12 min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary text-base font-bold text-on-primary shadow-raised transition-transform active:scale-[0.98] disabled:opacity-60"
                >
                  {busy ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-primary/40 border-t-on-primary" />
                      Signing you in…
                    </>
                  ) : tab === "pin" ? (
                    "Unlock"
                  ) : (
                    "Log in"
                  )}
                </button>

                <p className="flex items-center justify-center gap-1 text-center text-xs text-on-surface-variant">
                  <Icon name="verified_user" className="text-[14px]" /> One secure login for every
                  role.
                </p>
              </form>
            </div>

            <p className="text-center text-[11px] text-on-surface-variant">
              © 2026 SmartCanteen. Your records stay private to your canteen.
            </p>
          </div>

          {/* Brand panel */}
          <div className="relative hidden flex-col justify-center gap-md bg-primary p-10 text-on-primary md:flex">
            <div className="flex items-center gap-3">
              <BrandMark variant="dark" size="lg" />
              <div>
                <p className="text-lg font-bold text-secondary-container">
                  Smart<span className="text-on-primary">Canteen</span>
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-on-primary/70">
                  The smarter way to run your canteen
                </p>
              </div>
            </div>

            <h2 className="text-3xl font-bold leading-tight">
              Every shilling in and out of your canteen — counted for you.
            </h2>
            <p className="text-sm text-on-primary/80">
              Replace the paper book. Record sales, expenses and student credit as they happen, and
              see exactly how much cash you should be holding at the end of the day.
            </p>

            <ul className="space-y-2">
              {highlights.map((h) => (
                <li key={h.title} className="flex items-start gap-3 rounded-lg bg-on-primary/10 p-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-on-primary/15">
                    <Icon name={h.icon} className="text-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{h.title}</p>
                    <p className="text-xs text-on-primary/75">{h.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
