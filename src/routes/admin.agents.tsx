import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Card, Field, PrimaryButton, SectionTitle, SelectField } from "@/components/ui-kit";
import { Pill, statusTone } from "@/components/AdminShell";
import { useAuth } from "@/lib/auth";
import { ugx } from "@/lib/store";
import { agentChurnRate, fmtDate, stageLabels, statusLabels, usePlatform, zones } from "@/lib/platform";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">{label}</p>
      <p className="mt-0.5 truncate text-base font-bold text-on-surface">{value}</p>
    </div>
  );
}

export const Route = createFileRoute("/admin/agents")({
  head: () => ({
    meta: [
      { title: "Field Agents — SmartCanteen Admin" },
      {
        name: "description",
        content: "Approve agents, track certification, territories, onboarded accounts and churn-quality flags.",
      },
      { property: "og:title", content: "Field Agents — SmartCanteen Admin" },
      { property: "og:description", content: "The people selling SmartCanteen on the ground." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Agents,
});

function Agents() {
  const { s, addAgent, updateAgent, certifyAgent, updateSettings } = usePlatform();
  const { createAccount } = useAuth();
  const [f, setF] = useState({ name: "", phone: "", email: "", territory: zones[0]! });
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState<{ phone: string; code: string } | null>(null);

  const avgChurn =
    s.agents.reduce((a, x) => a + agentChurnRate(x.id, s.tenants), 0) / Math.max(1, s.agents.length);

  const register = async () => {
    if (busy) return;
    const email = f.email.trim().toLowerCase();
    if (!f.name.trim()) {
      setError("Full name is required.");
      return;
    }
    if (f.phone.replace(/\D/g, "").length < 9) {
      setError("Enter the agent's phone number — it is their login.");
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("That email address does not look right. You can also leave it blank.");
      return;
    }
    setBusy(true);
    const acc = await createAccount({
      name: f.name,
      email,
      school: f.territory,
      phone: f.phone,
      role: "agent",
    });
    if (!acc.ok || !acc.account) {
      setError(acc.error ?? "Could not create the agent login.");
      setMsg("");
      setBusy(false);
      return;
    }
    const agent = addAgent({
      accountId: acc.account.id,
      name: f.name.trim(),
      phone: acc.account.phone ?? f.phone.trim(),
      email,
      territory: f.territory,
    });
    setError("");
    setOtp({ phone: acc.account.phone ?? f.phone.trim(), code: acc.account.password ?? "" });
    setMsg(
      `${agent.name} registered as Pending. Send them the one-time password below — they log in with their phone number and must pass training before activating paying accounts.`,
    );
    setF((prev) => ({ ...prev, name: "", phone: "", email: "" }));
    setBusy(false);
  };


  return (
    <>
      <Card className="grid gap-sm sm:grid-cols-3">
        <Field
          label="Signup bonus (UGX)"
          inputMode="numeric"
          value={String(s.settings.signupBonus)}
          onChange={(e) => updateSettings({ signupBonus: Number(e.target.value) || 0 })}
        />
        <Field
          label="Recurring trail (% of subscription)"
          inputMode="numeric"
          value={String(s.settings.trailPct)}
          onChange={(e) => updateSettings({ trailPct: Number(e.target.value) || 0 })}
        />
        <Field
          label="Clawback window (days)"
          inputMode="numeric"
          hint="Signup bonus is reversed if the account churns inside this window."
          value={String(s.settings.clawbackDays)}
          onChange={(e) => updateSettings({ clawbackDays: Number(e.target.value) || 0 })}
        />
        <label className="flex items-center gap-2 text-sm font-bold text-on-surface-variant">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={s.settings.leaderboard}
            onChange={(e) => updateSettings({ leaderboard: e.target.checked })}
          />
          Show agent leaderboard
        </label>
      </Card>

      <Card className="space-y-sm">
        <SectionTitle>Register an agent (approval required)</SectionTitle>
        <div className="grid gap-sm sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Full name" value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} />
          <Field label="Phone" value={f.phone} onChange={(e) => setF((p) => ({ ...p, phone: e.target.value }))} />
          <Field label="Email / login" type="email" value={f.email} onChange={(e) => setF((p) => ({ ...p, email: e.target.value }))} />
          <p className="rounded-md bg-surface-low p-3 text-sm text-on-surface-variant sm:col-span-2 xl:col-span-1">
            A one-time password is generated after registration and shown below.
          </p>
          <SelectField label="Territory / zone" value={f.territory} onChange={(e) => setF((p) => ({ ...p, territory: e.target.value }))}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </SelectField>
        </div>
        {error ? <p className="text-sm font-semibold text-tertiary">{error}</p> : null}
        {msg ? <p className="text-sm font-semibold text-primary">{msg}</p> : null}
        {otp ? (
          <div className="rounded-md border border-outline-variant bg-surface-low p-3 text-sm text-on-surface">
            <p className="font-bold">Send these login details to the agent</p>
            <p className="mt-1">Phone: <span className="font-semibold">{otp.phone}</span></p>
            <p>One-time password: <span className="font-semibold tracking-widest">{otp.code}</span></p>
          </div>
        ) : null}
        <PrimaryButton onClick={register} disabled={busy}>
          <Icon name="person_add" /> {busy ? "Registering…" : "Register agent"}
        </PrimaryButton>
      </Card>

      <div className="space-y-sm">
        {s.agents.map((a) => {
          const mine = s.tenants.filter((t) => t.agentId === a.id);
          const churn = agentChurnRate(a.id, s.tenants);
          const mineCommissions = s.commissions.filter((c) => c.agentId === a.id);
          const earned = mineCommissions
            .filter((c) => c.status !== "clawback")
            .reduce((x, c) => x + c.amount, 0);
          const pending = mineCommissions
            .filter((c) => c.status === "pending")
            .reduce((x, c) => x + c.amount, 0);
          const paid = mineCommissions
            .filter((c) => c.status === "paid")
            .reduce((x, c) => x + c.amount, 0);
          const myLeads = s.leads.filter((l) => l.agentId === a.id);
          const active = mine.filter((t) => t.status === "active").length;
          const trial = mine.filter((t) => t.status === "trial").length;
          const activated = mine.filter((t) => t.checklist.firstSale).length;
          const open = openId === a.id;
          return (
            <Card key={a.id} className="space-y-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <button
                    onClick={() => setOpenId(open ? null : a.id)}
                    className="truncate text-left font-bold text-primary underline"
                    aria-expanded={open}
                  >
                    {a.name}
                  </button>
                  <p className="truncate text-xs text-on-surface-variant">
                    {a.email} · {a.phone} · {a.territory}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Pill tone={a.status === "certified" ? "good" : a.status === "pending" ? "warn" : "bad"}>
                      {a.status === "certified" ? "Certified" : a.status === "pending" ? "Pending approval" : "Suspended"}
                    </Pill>
                    <Pill tone="info">{mine.length} schools onboarded</Pill>
                    {a.trainedAt ? <Pill tone="info">Trained {fmtDate(a.trainedAt)}</Pill> : null}
                    {churn > avgChurn + 0.2 ? <Pill tone="bad">High churn — review quality</Pill> : null}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs text-on-surface-variant">
                  <p>{mine.length} accounts onboarded</p>
                  <p>UGX {ugx(earned)} commission</p>
                  <div className="mt-1 flex flex-wrap justify-end gap-2">
                    <button onClick={() => setOpenId(open ? null : a.id)} className="text-xs font-bold text-primary underline">
                      {open ? "Hide details" : "View details"}
                    </button>
                    {!a.certified ? (
                      <button onClick={() => certifyAgent(a.id)} className="text-xs font-bold text-primary underline">
                        Approve &amp; certify
                      </button>
                    ) : null}
                    <button
                      onClick={() => updateAgent(a.id, { status: a.status === "suspended" ? "certified" : "suspended" })}
                      className="text-xs font-bold text-tertiary underline"
                    >
                      {a.status === "suspended" ? "Restore" : "Suspend"}
                    </button>
                  </div>
                </div>
              </div>

              {open ? (
                <div className="space-y-sm rounded-md bg-surface-lowest p-sm">
                  <div className="grid grid-cols-2 gap-sm sm:grid-cols-4">
                    <Stat label="Schools onboarded" value={String(mine.length)} />
                    <Stat label="Paying / active" value={String(active)} />
                    <Stat label="On free trial" value={String(trial)} />
                    <Stat label="Actually using it" value={`${activated}/${mine.length}`} />
                    <Stat label="Leads captured" value={String(myLeads.length)} />
                    <Stat label="Churn rate" value={`${Math.round(churn * 100)}%`} />
                    <Stat label="Commission pending" value={`UGX ${ugx(pending)}`} />
                    <Stat label="Commission paid" value={`UGX ${ugx(paid)}`} />
                  </div>

                  <div className="grid gap-sm sm:grid-cols-2">
                    <SelectField
                      label="Territory / zone"
                      value={a.territory}
                      onChange={(e) => updateAgent(a.id, { territory: e.target.value })}
                    >
                      {zones.map((z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}
                    </SelectField>
                    <Field
                      label="Phone"
                      value={a.phone}
                      onChange={(e) => updateAgent(a.id, { phone: e.target.value })}
                    />
                  </div>

                  <div>
                    <p className="mb-1 text-sm font-bold text-on-surface">Schools this agent brought in</p>
                    {mine.length === 0 ? (
                      <p className="text-xs text-on-surface-variant">
                        None yet. Attach a school to this agent from the Accounts page.
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {mine.map((t) => (
                          <li key={t.accountId} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface px-3 py-2">
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-on-surface">{t.canteenName}</span>
                              <span className="block truncate text-xs text-on-surface-variant">
                                {t.school || "—"} · joined {fmtDate(t.createdAt)}
                              </span>
                            </span>
                            <Pill tone={statusTone(t.status)}>{statusLabels[t.status]}</Pill>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {myLeads.length ? (
                    <div>
                      <p className="mb-1 text-sm font-bold text-on-surface">Leads in progress</p>
                      <ul className="space-y-1">
                        {myLeads.slice(0, 8).map((l) => (
                          <li key={l.id} className="flex items-center justify-between gap-2 text-xs text-on-surface-variant">
                            <span className="truncate">{l.school} · {l.contactName}</span>
                            <Pill tone="info">{stageLabels[l.stage]}</Pill>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-sm">
                    <button
                      onClick={() => requestPayout(a.id, pending)}
                      disabled={pending <= 0}
                      className="min-h-11 rounded-full bg-primary px-4 text-sm font-bold text-on-primary disabled:opacity-40"
                    >
                      Request payout of UGX {ugx(pending)}
                    </button>
                  </div>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

    </>
  );
}
