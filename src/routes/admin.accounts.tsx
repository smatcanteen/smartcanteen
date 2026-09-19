import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { listAccountProgress } from "@/lib/accounts.functions";
import { Icon } from "@/components/Icon";
import { Card, Field, PrimaryButton, SectionTitle, SelectField } from "@/components/ui-kit";
import { Pill, can, statusTone } from "@/components/AdminShell";
import { useAuth } from "@/lib/auth";
import { loginLink, whatsappLink } from "@/lib/invite";

import {
  categoryLabels,
  checklistDone,
  effectiveTenantStatus,
  fmtDate,
  statusLabels,
  tagLabels,
  usePlatform,
  zones,
  type FollowUpTag,
  type TenantStatus,
} from "@/lib/platform";

export const Route = createFileRoute("/admin/accounts")({
  head: () => ({
    meta: [
      { title: "Canteen Accounts — SmartCanteen Admin" },
      {
        name: "description",
        content: "Search, filter, tag and bulk-manage every canteen account across zones and categories.",
      },
      { property: "og:title", content: "Canteen Accounts — SmartCanteen Admin" },
      { property: "og:description", content: "Portfolio account management for SmartCanteen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Accounts,
});

const filters: { key: TenantStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "trial", label: "Trial" },
  { key: "past_due", label: "Past due" },
  { key: "suspended", label: "Suspended" },
  { key: "churned", label: "Deactivated" },
];

function Accounts() {
  const { user, accounts, toggleAccount, resendOtp } = useAuth();
  const { s, updateTenant, toggleTag, addTenantNote, logAction } = usePlatform();
  type Progress = {
    accountId: string;
    entries: number;
    lastLoginAt: number | null;
    checklist: { loggedIn: boolean; capitalSet: boolean; firstStock: boolean; firstSale: boolean };
  };
  const [live, setLive] = useState<Record<string, Progress>>({});
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<TenantStatus | "all">("all");
  const [zone, setZone] = useState("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [otp, setOtp] = useState<{ id: string; code: string } | null>(null);
  const [actionError, setActionError] = useState("");

  // Pull the operators' real progress from the backend so the onboarding ticks
  // below show what they actually did, not a stale local copy.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await listAccountProgress();
        if (!alive || !res.ok) return;
        const map: Record<string, Progress> = {};
        res.rows.forEach((r) => (map[r.accountId] = r as Progress));
        setLive(map);
      } catch {
        /* offline — keep whatever we already show */
      }
    };
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const rows = useMemo(
    () => {
      const existingOperatorIds = new Set(
        accounts.filter((account) => account.role === "operator").map((account) => account.id),
      );
      return s.tenants
        .filter((tenant) => existingOperatorIds.has(tenant.accountId))
        .map((t) => {
          const p = live[t.accountId];
          const merged = p
            ? { ...t, checklist: p.checklist, entries: p.entries, lastLoginAt: p.lastLoginAt }
            : t;
          return { ...merged, status: effectiveTenantStatus(merged) };
        })
        .filter((t) => {
          const hay = `${t.canteenName} ${t.school} ${t.ownerName} ${t.phone}`.toLowerCase();
          if (q && !hay.includes(q.toLowerCase())) return false;
          if (filter !== "all" && t.status !== filter) return false;
          if (zone !== "all" && t.zone !== zone) return false;
          return true;
        });
    },
    [s.tenants, accounts, live, q, filter, zone],
  );

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const renewalDate = (tenant: (typeof rows)[number]) => {
    const from = new Date(Math.max(Date.now(), tenant.nextBillingAt));
    from.setMonth(from.getMonth() + 4);
    return from.getTime();
  };

  const renew = async (tenant: (typeof rows)[number]) => {
    updateTenant(tenant.accountId, { status: "active", trialEndsAt: null, nextBillingAt: renewalDate(tenant) });
    const account = accounts.find((item) => item.id === tenant.accountId);
    if (account && !account.active) await toggleAccount(tenant.accountId);
    logAction(user?.name ?? "admin", `Renewed ${tenant.canteenName} for 4 months`);
  };

  const deactivate = (tenant: (typeof rows)[number]) => {
    updateTenant(tenant.accountId, { status: "churned", trialEndsAt: null, nextBillingAt: Date.now() });
    logAction(user?.name ?? "admin", `Deactivated ${tenant.canteenName} subscription; past records remain read-only`);
  };

  const counts = rows.reduce(
    (total, tenant) => ({ ...total, [tenant.status]: (total[tenant.status] ?? 0) + 1 }),
    {} as Record<string, number>,
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-sm">
        <div className="min-w-[220px] flex-1">
          <Field label="Search" placeholder="Search name, school or phone" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1 pt-5">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`min-h-11 rounded-full px-4 text-sm font-bold ${
                filter === f.key ? "bg-primary text-on-primary" : "bg-surface-lowest text-on-surface-variant"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 pt-5">
          {["all", ...zones].map((z) => (
            <button
              key={z}
              onClick={() => setZone(z)}
              className={`min-h-11 rounded-full px-3 text-xs font-bold ${
                zone === z ? "bg-secondary text-on-secondary" : "bg-surface-lowest text-on-surface-variant"
              }`}
            >
              {z === "all" ? "All zones" : z}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ["Active", counts.active ?? 0, "text-primary"],
          ["Trial", counts.trial ?? 0, "text-on-surface"],
          ["Expired", counts.past_due ?? 0, "text-secondary"],
          ["Suspended", counts.suspended ?? 0, "text-tertiary"],
          ["Deactivated", counts.churned ?? 0, "text-on-surface-variant"],
        ].map(([label, value, tone]) => (
          <Card key={String(label)} className="p-3">
            <p className="text-xs font-bold text-on-surface-variant">{label}</p>
            <p className={`text-2xl font-extrabold ${tone}`}>{value}</p>
          </Card>
        ))}
      </div>

      {picked.length ? (
        <Card className="flex flex-wrap items-center gap-sm">
          <span className="text-sm font-bold text-on-surface">{picked.length} selected</span>
          <button
            onClick={() => {
              rows.filter((tenant) => picked.includes(tenant.accountId)).forEach((tenant) => void renew(tenant));
              setPicked([]);
            }}
            className="min-h-11 rounded-full bg-primary px-4 text-sm font-bold text-on-primary"
          >
            Renew / activate
          </button>
          {can(user?.role, "suspend") ? (
            <button
              onClick={() => {
                rows.filter((tenant) => picked.includes(tenant.accountId)).forEach(deactivate);
                setPicked([]);
              }}
              className="min-h-11 rounded-full bg-tertiary px-4 text-sm font-bold text-on-tertiary"
            >
              Deactivate subscriptions
            </button>
          ) : null}
          <button onClick={() => setPicked([])} className="min-h-11 px-3 text-sm font-bold text-primary">
            Clear
          </button>
        </Card>
      ) : null}

      <div className="space-y-sm">
        {rows.map((t) => (
          <Card key={t.accountId} className="space-y-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <label className="flex min-w-0 items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5"
                  checked={picked.includes(t.accountId)}
                  onChange={() => toggle(t.accountId)}
                  aria-label={`Select ${t.canteenName}`}
                />
                <span className="min-w-0">
                  <span className="block truncate font-bold text-on-surface">{t.canteenName}</span>
                  <span className="block truncate text-xs text-on-surface-variant">
                    {t.school || "—"} · {t.ownerName} · {t.phone}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1">
                    <Pill tone={statusTone(t.status)}>{statusLabels[t.status]}</Pill>
                    <Pill tone="info">{categoryLabels[t.category]}</Pill>
                    <Pill tone="info">{t.zone}</Pill>
                    {t.tags.map((tag) => (
                      <Pill key={tag} tone="warn">
                        {tagLabels[tag]}
                      </Pill>
                    ))}
                  </span>
                </span>
              </label>
              <div className="shrink-0 text-right text-xs text-on-surface-variant">
                <p>Next billing {fmtDate(t.nextBillingAt)}</p>
                <p>Last login {t.lastLoginAt ? fmtDate(t.lastLoginAt) : "Never"}</p>
                <p>{t.entries} entries</p>
                <button
                  onClick={() => setOpenId(openId === t.accountId ? null : t.accountId)}
                  className="mt-1 text-xs font-bold text-primary underline"
                >
                  {openId === t.accountId ? "Hide detail" : "Open detail"}
                </button>
              </div>
            </div>

            <div className="grid gap-2 rounded-md border border-outline-variant bg-surface-lowest p-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Subscription</p>
                <p className="text-sm font-extrabold text-on-surface">{statusLabels[t.status]}</p>
                <p className="text-xs text-on-surface-variant">
                  {t.status === "active" || t.status === "trial" ? `Access ends ${fmtDate(t.nextBillingAt)}` : "Past records remain available; new entries are locked."}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                <button onClick={() => void renew(t)} className="min-h-10 rounded-full bg-primary px-4 text-xs font-bold text-on-primary">
                  {t.status === "active" ? "Renew 4 months" : "Activate for 4 months"}
                </button>
                {t.status !== "churned" ? (
                  <button onClick={() => deactivate(t)} className="min-h-10 rounded-full border-2 border-tertiary px-3 text-xs font-bold text-tertiary">
                    Deactivate subscription
                  </button>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-1">
              {(["loggedIn", "capitalSet", "firstStock", "firstSale"] as const).map((k) => (
                <Pill key={k} tone={t.checklist[k] ? "good" : "bad"}>
                  <Icon name={t.checklist[k] ? "check" : "close"} className="text-[14px]" />
                  {k === "loggedIn"
                    ? "Logged in"
                    : k === "capitalSet"
                      ? "Opening capital"
                      : k === "firstStock"
                        ? "First stock"
                        : "First sale"}
                </Pill>
              ))}
              <span className="text-xs text-on-surface-variant">{checklistDone(t)}/4 onboarding steps</span>
            </div>

            {openId === t.accountId ? (
              <div className="space-y-sm rounded-md bg-surface-lowest p-sm">
                <div className="flex flex-wrap gap-1">
                  {(Object.keys(tagLabels) as FollowUpTag[]).map((tag) => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(t.accountId, tag)}
                      className={`min-h-11 rounded-full px-3 text-xs font-bold ${
                        t.tags.includes(tag)
                          ? "bg-secondary text-on-secondary"
                          : "border-2 border-outline-variant text-on-surface-variant"
                      }`}
                    >
                      {tagLabels[tag]}
                    </button>
                  ))}
                </div>

                <p className="text-xs text-on-surface-variant">
                  Term calendar: {t.termStart} → {t.termEnd}
                </p>

                <div className="space-y-2 rounded-md border border-outline-variant bg-surface p-sm">
                  <p className="text-sm font-bold text-on-surface">Subscription &amp; trial</p>
                  <p className="text-xs text-on-surface-variant">
                    {t.trialEndsAt ? `Trial ends ${fmtDate(t.trialEndsAt)} · ` : ""}
                    Next billing {fmtDate(t.nextBillingAt)}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {[7, 14, 30].map((d) => (
                      <button
                        key={d}
                        onClick={() => {
                          const base = Math.max(Date.now(), t.trialEndsAt ?? t.nextBillingAt);
                          const until = base + d * 86400000;
                          updateTenant(t.accountId, {
                            status: "trial",
                            trialEndsAt: until,
                            nextBillingAt: until,
                          });
                          logAction(user?.name ?? "admin", `Extended ${t.canteenName} trial by ${d} days`);
                        }}
                        className="min-h-11 rounded-full border-2 border-primary px-3 text-xs font-bold text-primary"
                      >
                        Extend trial +{d}d
                      </button>
                    ))}
                    <button
                      onClick={() => void renew(t)}
                      className="min-h-11 rounded-full bg-primary px-4 text-xs font-bold text-on-primary"
                    >
                      {t.status === "active" ? "Renew 4 months" : "Activate for 4 months"}
                    </button>
                    {t.status !== "churned" ? (
                      <button
                        onClick={() => deactivate(t)}
                        className="min-h-11 rounded-full border-2 border-tertiary px-3 text-xs font-bold text-tertiary"
                      >
                        Deactivate subscription
                      </button>
                    ) : null}
                  </div>
                  <div className="grid gap-sm sm:grid-cols-3">
                    <SelectField
                      label="Plan / category"
                      value={t.category}
                      onChange={(e) =>
                        updateTenant(t.accountId, {
                          category: e.target.value as keyof typeof categoryLabels,
                        })
                      }
                    >
                      {(Object.keys(categoryLabels) as (keyof typeof categoryLabels)[]).map((c) => (
                        <option key={c} value={c}>
                          {categoryLabels[c]}
                        </option>
                      ))}
                    </SelectField>
                    <SelectField
                      label="Zone"
                      value={t.zone}
                      onChange={(e) => updateTenant(t.accountId, { zone: e.target.value })}
                    >
                      {zones.map((z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}
                    </SelectField>
                    <SelectField
                      label="Field agent"
                      value={t.agentId ?? ""}
                      onChange={(e) => updateTenant(t.accountId, { agentId: e.target.value || null })}
                    >
                      <option value="">No agent</option>
                      {s.agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                </div>


                <div className="flex flex-wrap gap-sm">
                  {can(user?.role, "suspend") ? (
                    <button
                      disabled={busyId === t.accountId}
                      onClick={async () => {
                        setBusyId(t.accountId);
                        updateTenant(t.accountId, {
                          status: t.status === "suspended" ? "active" : "suspended",
                        });
                        await toggleAccount(t.accountId);
                        setBusyId(null);
                      }}
                      className="min-h-11 rounded-full bg-tertiary px-4 text-sm font-bold text-on-tertiary disabled:opacity-50"
                    >
                      {t.status === "suspended" ? "Restore login" : "Suspend login"}
                    </button>
                  ) : null}
                  {(() => {
                    const acc = accounts.find((a) => a.id === t.accountId);
                    if (!acc?.pinLocked && !acc?.pinResetRequested) return null;
                    return (
                      <span className="inline-flex min-h-11 items-center gap-1 rounded-full bg-tertiary/15 px-3 text-sm font-bold text-tertiary">
                        <Icon name="lock_reset" className="text-[18px]" />
                        {acc.pinLocked
                          ? "Locked out — tap New one-time password"
                          : "Asked for a new PIN — tap New one-time password"}
                      </span>
                    );
                  })()}

                  {can(user?.role, "suspend") ? (
                    <button
                      disabled={busyId === t.accountId}
                      onClick={async () => {
                        if (!accounts.some((a) => a.id === t.accountId)) {
                          setActionError(
                            "This row has no login yet — create the operator login first.",
                          );
                          return;
                        }
                        setBusyId(t.accountId);
                        setActionError("");
                        const res = await resendOtp(t.accountId);
                        setBusyId(null);
                        if (!res.ok || !res.otp) {
                          setActionError(res.error ?? "Could not issue a new one-time password.");
                          return;
                        }
                        setOtp({ id: t.accountId, code: res.otp });
                      }}
                      className="min-h-11 rounded-full border-2 border-outline-variant px-4 text-sm font-bold text-on-surface-variant disabled:opacity-50"
                    >
                      <Icon name="sms" className="text-[18px]" />{" "}
                      {busyId === t.accountId ? "Working…" : "New one-time password"}
                    </button>
                  ) : null}

                </div>

                {actionError ? (
                  <p className="text-sm font-semibold text-tertiary">{actionError}</p>
                ) : null}
                {accounts.some((a) => a.id === t.accountId && !a.active) ? (
                  <p className="text-xs font-semibold text-tertiary">
                    This login is paused — the operator cannot sign in.
                  </p>
                ) : null}

                <div className="flex gap-sm">
                  <div className="flex-1">
                    <Field label="Internal note" value={note} onChange={(e) => setNote(e.target.value)} />
                  </div>
                  <div className="w-32 self-end">
                    <PrimaryButton
                      onClick={() => {
                        if (!note.trim()) return;
                        addTenantNote(t.accountId, note.trim());
                        setNote("");
                      }}
                    >
                      Save
                    </PrimaryButton>
                  </div>
                </div>
                {t.notes.map((n) => (
                  <p key={n.id} className="text-xs text-on-surface-variant">
                    {fmtDate(n.ts)} — {n.text}
                  </p>
                ))}
              </div>
            ) : null}
          </Card>
        ))}
        {rows.length === 0 ? <SectionTitle>No accounts match this filter.</SectionTitle> : null}
      </div>
      {otp ? (
        <OtpModal
          code={otp.code}
          ownerName={
            s.tenants.find((t) => t.accountId === otp.id)?.ownerName ?? "the operator"
          }
          phone={accounts.find((a) => a.id === otp.id)?.phone ?? ""}
          onClose={() => setOtp(null)}
        />
      ) : null}
    </>
  );
}

function OtpModal({
  code,
  ownerName,
  phone,
  onClose,
}: {
  code: string;
  ownerName: string;
  phone: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const msg = `Hello ${ownerName}, here is your new SmartCanteen one-time password: ${code}\nPhone number to log in: +${phone}\nOpen: ${loginLink}\nAfter signing in, set a new PIN in Settings.`;
  const wa = whatsappLink(phone || undefined, msg);

  const copyMessage = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(msg);
      } else {
        // Fallback for older browsers / non-secure contexts
        const ta = document.createElement("textarea");
        ta.value = msg;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Last resort: select text so the user can manually copy
      const ta = document.createElement("textarea");
      ta.value = msg;
      ta.style.position = "fixed";
      ta.style.width = "20rem";
      ta.style.height = "8rem";
      ta.style.top = "50%";
      ta.style.left = "50%";
      ta.style.transform = "translate(-50%,-50%)";
      ta.style.zIndex = "200";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      window.setTimeout(() => document.body.removeChild(ta), 30000);
    }
  };

  // Rendered at the page root through a portal so no card layout can clip or
  // squeeze it; lock the page scroll while it is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-on-surface/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="New one-time password"
      onClick={onClose}
    >
      <div
        className="w-[min(100%,22rem)] rounded-md bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-lg font-extrabold text-on-surface">One-time password</h3>
            <p className="mt-1 text-sm text-on-surface-variant">Send this code to {ownerName}.</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-on-surface-variant"
          >
            <Icon name="close" className="text-[22px]" />
          </button>
        </div>

        <div className="my-5 rounded-md border-2 border-outline-variant bg-surface-lowest px-3 py-4 text-center">
          <p className="whitespace-nowrap font-mono text-2xl font-extrabold text-on-surface">{code}</p>
        </div>

        <div className="space-y-2">
          {wa ? (
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-on-primary"
            >
              <Icon name="chat" className="text-[18px]" /> Send on WhatsApp
            </a>
          ) : null}
          <button
            onClick={() => void copyMessage()}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md border-2 border-outline-variant px-4 text-sm font-bold text-on-surface-variant"
          >
            <Icon name={copied ? "check" : "content_copy"} className="text-[18px]" />
            {copied ? "Copied" : "Copy message"}
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-on-surface-variant">
          The operator uses this once, then creates a new PIN.
        </p>
      </div>
    </div>,
    document.body,
  );
}
