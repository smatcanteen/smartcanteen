import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Card, Field, PrimaryButton, SectionTitle, SelectField } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import { seedAccountBook } from "@/lib/store";
import { emailLink, prettyPhone, fillTemplate, inviteMessage, loginLink, whatsappLink } from "@/lib/invite";
import {
  categoryLabels,
  usePlatform,
  zones,
  type CategoryTemplate,
} from "@/lib/platform";

export const Route = createFileRoute("/admin/new")({
  head: () => ({
    meta: [
      { title: "New Canteen Account — SmartCanteen Admin" },
      {
        name: "description",
        content:
          "Account creation wizard: business details, category template, trial length, agent tagging and a WhatsApp invite link.",
      },
      { property: "og:title", content: "New Canteen Account — SmartCanteen Admin" },
      { property: "og:description", content: "Onboard a canteen in four guided steps." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NewAccount,
});

const steps = ["Business", "Template & term", "Access", "Opening capital", "Invite"] as const;

function NewAccount() {
  const { user, createOperator } = useAuth();
  const { s, addTenant, updateSettings, addCommission } = usePlatform();
  const [step, setStep] = useState(0);
  const [f, setF] = useState({
    canteenName: "",
    school: "",
    ownerName: "",
    phone: "",
    email: "",
    password: "",
    category: "day" as CategoryTemplate,
    zone: zones[0]!,
    agentId: "",
    trialDays: "14",
    termStart: "2026-09-07",
    termEnd: "2026-12-05",
    notes: "",
    cloneFrom: "",
    csv: "",
    capital: "",
    goal: "",
    termName: `Term 1, ${new Date().getFullYear()}`,
  });
  const [invite, setInvite] = useState<{ wa: string | null; mail: string | null; msg: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof f>) => setF((prev) => ({ ...prev, ...patch }));

  const clone = (accountId: string) => {
    const t = s.tenants.find((x) => x.accountId === accountId);
    if (!t) return set({ cloneFrom: "" });
    set({
      cloneFrom: accountId,
      category: t.category,
      zone: t.zone,
      school: t.school,
      termStart: t.termStart,
      termEnd: t.termEnd,
      agentId: t.agentId ?? "",
    });
  };

  const emailOk = (v: string) => !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  const phoneOk = (v: string) => v.replace(/\D/g, "").length >= 9;

  const next = () => {
    if (step === 0 && (!f.ownerName.trim() || !f.school.trim())) {
      setError("Owner name and school name are required.");
      return;
    }
    if (step === 0 && !phoneOk(f.phone)) {
      setError("Enter the operator's phone number — it is their login.");
      return;
    }
    if (step === 2 && !emailOk(f.email)) {
      setError("That email address does not look right. You can also leave it blank.");
      return;
    }
    setError("");
    setStep((x) => x + 1);
  };

  const finish = async () => {
    if (busy) return;
    if (!phoneOk(f.phone)) {
      setError("Enter the operator's phone number — it is their login.");
      return;
    }
    if (!emailOk(f.email)) {
      setError("That email address does not look right. You can also leave it blank.");
      return;
    }
    setBusy(true);
    const res = await createOperator({
      name: f.ownerName,
      email: f.email,
      school: f.school,
      phone: f.phone,
    });
    if (!res.ok || !res.account) {
      setError(res.error ?? "Could not create the account.");
      setBusy(false);
      return;
    }
    setError("");
    const otp = res.account.password ?? "";
    const phone = res.account.phone ?? f.phone;
    set({ password: otp, phone });
    const trialDays = Number(f.trialDays) || 0;
    addTenant({
      accountId: res.account.id,
      canteenName: f.canteenName.trim() || `${f.ownerName.trim()}'s canteen`,
      school: f.school,
      ownerName: f.ownerName,
      phone,
      category: f.category,
      zone: f.zone,
      agentId: f.agentId || null,
      status: trialDays > 0 ? "trial" : "active",
      trialEndsAt: trialDays > 0 ? Date.now() + trialDays * 86400000 : null,
      nextBillingAt: Date.now() + (trialDays > 0 ? trialDays : 30 * s.settings.months) * 86400000,
      tags: [],
      checklist: { loggedIn: false, capitalSet: false, firstStock: false, firstSale: false },
      termStart: f.termStart,
      termEnd: f.termEnd,
    });
    if (f.agentId) {
      addCommission({
        agentId: f.agentId,
        accountId: res.account.id,
        type: "signup",
        amount: s.settings.signupBonus,
        status: "pending",
      });
    }
    // Give the operator a clean book that already holds their opening capital.
    seedAccountBook(res.account.id, {
      capital: Number(f.capital) || 0,
      termName: f.termName.trim(),
      goal: Number(f.goal) || 0,
    });

    const details = {
      name: f.ownerName,
      email: f.email,
      password: otp,
      phone,
      school: f.school,
      capital: Number(f.capital) || 0,
      termName: f.termName,
    };
    const template = s.settings.welcomeTemplate?.trim();
    const msg = template ? fillTemplate(template, details) : inviteMessage(details);
    setInvite({ wa: whatsappLink(phone, msg), mail: emailLink(f.email, msg), msg });
    setStep(4);
    setBusy(false);
  };



  return (
    <>
      <div className="flex gap-2">
        {steps.map((label, i) => (
          <div key={label} className="flex-1">
            <div className={`h-1.5 rounded-full ${i <= step ? "bg-primary" : "bg-outline-variant"}`} />
            <p className="mt-1 text-xs font-semibold text-on-surface-variant">{label}</p>
          </div>
        ))}
      </div>

      {error ? (
        <p className="rounded-md bg-tertiary-container px-3 py-2 text-sm font-semibold text-on-tertiary-container">
          {error}
        </p>
      ) : null}


      {step === 0 && (
        <Card className="grid gap-sm sm:grid-cols-2">
          <Field label="Canteen / business name" value={f.canteenName} onChange={(e) => set({ canteenName: e.target.value })} />
          <Field label="School name" value={f.school} onChange={(e) => set({ school: e.target.value })} />
          <Field label="Owner name" value={f.ownerName} onChange={(e) => set({ ownerName: e.target.value })} />
          <Field label="Owner phone" placeholder="+2567…" value={f.phone} onChange={(e) => set({ phone: e.target.value })} />
          <SelectField label="Clone setup from" value={f.cloneFrom} onChange={(e) => clone(e.target.value)}>
            <option value="">Start fresh</option>
            {s.tenants.map((t) => (
              <option key={t.accountId} value={t.accountId}>
                {t.canteenName}
              </option>
            ))}
          </SelectField>
          <Field label="Internal note" value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Card>
      )}

      {step === 1 && (
        <Card className="grid gap-sm sm:grid-cols-2">
          <SelectField
            label="Category template"
            value={f.category}
            onChange={(e) => set({ category: e.target.value as CategoryTemplate })}
          >
            {(Object.keys(categoryLabels) as CategoryTemplate[]).map((k) => (
              <option key={k} value={k}>
                {categoryLabels[k]}
              </option>
            ))}
          </SelectField>
          <SelectField label="Zone / district" value={f.zone} onChange={(e) => set({ zone: e.target.value })}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </SelectField>
          <Field label="Term starts" type="date" value={f.termStart} onChange={(e) => set({ termStart: e.target.value })} />
          <Field label="Term ends" type="date" value={f.termEnd} onChange={(e) => set({ termEnd: e.target.value })} />
          <Field
            label="Trial length (days)"
            inputMode="numeric"
            hint="0 activates the subscription immediately."
            value={f.trialDays}
            onChange={(e) => set({ trialDays: e.target.value })}
          />
          <SelectField label="Assigned agent / source" value={f.agentId} onChange={(e) => set({ agentId: e.target.value })}>
            <option value="">Direct — no agent</option>
            {s.agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.territory} {a.certified ? "" : "(uncertified)"}
              </option>
            ))}
          </SelectField>
        </Card>
      )}

      {step === 2 && (
        <Card className="space-y-sm">
          <div className="rounded-lg border border-outline-variant/60 bg-surface-low p-sm">
            <p className="label-bold text-on-surface-variant">How this operator signs in</p>
            <p className="mt-1 text-sm text-on-surface">
              They log in with their phone number{" "}
              <span className="font-bold">{prettyPhone(f.phone)}</span> and a one-time password
              SmartCanteen generates when you create the account. You send it to them on WhatsApp on
              the last step. After their first login they set a private PIN in Settings and unlock
              the app with that.
            </p>
          </div>
          <Field
            label="Email address (optional)"
            type="email"
            hint="Many operators have no email — leave this blank and use WhatsApp."
            value={f.email}
            onChange={(e) => set({ email: e.target.value })}
          />
          <SectionTitle>Starting stock — bulk CSV (name,qty,buy,sell)</SectionTitle>
          <textarea
            value={f.csv}
            onChange={(e) => set({ csv: e.target.value })}
            rows={4}
            placeholder="Mandazi,200,40000,500"
            className="w-full rounded-md border-2 border-outline-variant bg-surface-lowest p-3 text-sm text-on-surface"
          />
          <p className="text-xs text-on-surface-variant">
            {f.csv.trim() ? `${f.csv.trim().split("\n").length} item rows will be handed to the operator.` : "Optional."}
          </p>
          {error ? <p className="text-sm font-semibold text-tertiary">{error}</p> : null}
        </Card>
      )}


      {step === 3 && (
        <Card className="space-y-sm">
          <p className="text-sm text-on-surface-variant">
            Enter the money the canteen is starting this term with. It becomes the operator's opening
            Cash at Hand, so their very first screen is already correct.
          </p>
          <div className="grid gap-sm sm:grid-cols-2">
            <Field label="Term name" value={f.termName} onChange={(e) => set({ termName: e.target.value })} />
            <Field
              label="Opening capital (UGX)"
              inputMode="numeric"
              placeholder="e.g. 2000000"
              value={f.capital}
              onChange={(e) => set({ capital: e.target.value })}
            />
            <Field
              label="Target by term end (UGX)"
              inputMode="numeric"
              hint="Blank sets double the opening capital."
              value={f.goal}
              onChange={(e) => set({ goal: e.target.value })}
            />
          </div>
          {error ? <p className="text-sm font-semibold text-tertiary">{error}</p> : null}
        </Card>
      )}

      {step === 4 && (
        <Card className="space-y-sm">
          <p className="flex items-center gap-1 text-sm font-bold text-primary">
            <Icon name="check_circle" /> Account created for {f.ownerName || "the operator"}.
          </p>

          <div className="rounded-lg border border-outline-variant/60 bg-surface-low p-sm">
            <p className="label-bold text-on-surface-variant">What they receive</p>
            <dl className="mt-1 space-y-1 text-sm text-on-surface">
              <div className="flex justify-between gap-2">
                <dt className="text-on-surface-variant">Login page</dt>
                <dd className="truncate font-semibold">{loginLink.replace("https://", "")}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-on-surface-variant">Phone (their login)</dt>
                <dd className="truncate font-semibold">{prettyPhone(f.phone)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-on-surface-variant">Email</dt>
                <dd className="truncate font-semibold">{f.email.trim().toLowerCase() || "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-on-surface-variant">One-time password</dt>
                <dd className="font-semibold tracking-widest">{f.password || "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-on-surface-variant">Opening capital</dt>
                <dd className="font-semibold">UGX {(Number(f.capital) || 0).toLocaleString("en-UG")}</dd>
              </div>
            </dl>
          </div>

          <SectionTitle>Welcome message</SectionTitle>
          <textarea
            rows={4}
            value={s.settings.welcomeTemplate}
            onChange={(e) => updateSettings({ welcomeTemplate: e.target.value })}
            placeholder="Leave blank to use the standard SmartCanteen welcome with {name} {email} {password} {link}"
            className="w-full rounded-md border-2 border-outline-variant bg-surface-lowest p-3 text-sm text-on-surface"
          />

          {invite ? (
            <>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-surface-low p-3 text-xs text-on-surface-variant">
                {invite.msg}
              </pre>
              <div className="grid gap-sm sm:grid-cols-2">
                {invite.wa ? (
                  <a
                    href={invite.wa}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary text-base font-bold text-on-primary"
                  >
                    <Icon name="chat" /> Send on WhatsApp
                  </a>
                ) : (
                  <p className="flex min-h-12 items-center justify-center rounded-md border-2 border-dashed border-outline-variant text-xs text-on-surface-variant">
                    No valid phone number for WhatsApp
                  </p>
                )}
                {invite.mail ? (
                  <a
                    href={invite.mail}
                    className="flex min-h-12 items-center justify-center gap-2 rounded-md border-2 border-primary text-base font-bold text-primary"
                  >
                    <Icon name="mail" /> Send by email
                  </a>
                ) : (
                  <p className="flex min-h-12 items-center justify-center rounded-md border-2 border-dashed border-outline-variant text-xs text-on-surface-variant">
                    No email address on file
                  </p>
                )}
              </div>
              <button
                onClick={() => navigator.clipboard?.writeText(invite.msg)}
                className="min-h-11 w-full rounded-md border-2 border-outline-variant text-sm font-bold text-on-surface-variant"
              >
                <Icon name="content_copy" className="text-[18px]" /> Copy message
              </button>
            </>
          ) : null}

          <p className="text-xs text-on-surface-variant">Created by {user?.name}.</p>
        </Card>
      )}


      <div className="sticky bottom-0 z-10 -mx-4 flex gap-sm bg-surface-high/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:bg-transparent md:px-0 md:py-0">
        {step > 0 && step < 4 ? (
          <button
            onClick={() => {
              setError("");
              setStep((x) => x - 1);
            }}
            className="h-12 flex-1 rounded-md border-2 border-outline-variant font-bold text-on-surface-variant"
          >
            Back
          </button>
        ) : null}
        <div className="flex-[2]">
          {step < 3 ? (
            <PrimaryButton onClick={next}>
              Continue <Icon name="arrow_forward" />
            </PrimaryButton>
          ) : step === 3 ? (
            <PrimaryButton tone="cta" onClick={finish} disabled={busy}>
              {busy ? "Creating…" : "Create account"} <Icon name="check" />
            </PrimaryButton>
          ) : (
            <PrimaryButton
              onClick={() => {
                setStep(0);
                setInvite(null);
                setError("");
                set({
                  canteenName: "",
                  ownerName: "",
                  email: "",
                  password: "",
                  phone: "",
                  csv: "",
                  cloneFrom: "",
                  capital: "",
                  goal: "",
                });
              }}
            >
              Create another
            </PrimaryButton>
          )}
        </div>

      </div>

    </>
  );
}
