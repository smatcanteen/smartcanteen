import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { listAccountProgress } from "@/lib/accounts.functions";
import { Icon } from "@/components/Icon";
import { Card, Field, PrimaryButton, SectionTitle } from "@/components/ui-kit";
import { Pill, can, statusTone } from "@/components/AdminShell";
import { useAuth } from "@/lib/auth";
import { loginLink, whatsappLink } from "@/lib/invite";

import {
  categoryLabels,
  checklistDone,
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
];

function Accounts() {
  const { user, accounts, toggleAccount, removeAccount, resendOtp } = useAuth();
  const { s, updateTenant, removeTenant, toggleTag, bulkStatus, addTenantNote, logAction } =
    usePlatform();
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
          return p
            ? { ...t, checklist: p.checklist, entries: p.entries, lastLoginAt: p.lastLoginAt }
            : t;
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

      {picked.length ? (
        <Card className="flex flex-wrap items-center gap-sm">
          <span className="text-sm font-bold text-on-surface">{picked.length} selected</span>
          <button
            onClick={() => {
              bulkStatus(picked, "active");
              setPicked([]);
            }}
            className="min-h-11 rounded-full bg-primary px-4 text-sm font-bold text-on-primary"
          >
            Renew / activate
          </button>
          {can(user?.role, "suspend") ? (
            <button
              onClick={() => {
                bulkStatus(picked, "suspended");
                setPicked([]);
              }}
              className="min-h-11 rounded-full bg-tertiary px-4 text-sm font-bold text-on-tertiary"
            >
              Suspend
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

                <div className="flex flex-wrap gap-sm">
                  <button
                    onClick={() => logAction(user?.name ?? "admin", `Viewed ${t.canteenName} as operator (read-only)`)}
                    className="min-h-11 rounded-full border-2 border-primary px-4 text-sm font-bold text-primary"
                  >
                    <Icon name="visibility" className="text-[18px]" /> View as operator (logged)
                  </button>
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
                      {t.status === "suspended" ? "Restore access" : "Pause account"}
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
                        setBusyId(t.accountId);
                        const res = await resendOtp(t.accountId);
                        setBusyId(null);
                        if (!res.ok) {
                          setActionError(res.error ?? "Could not issue a new one-time password.");
                          return;
                        }
                        setActionError("");
                        setOtp({ id: t.accountId, code: res.otp ?? "" });
                      }}
                      className="min-h-11 rounded-full border-2 border-outline-variant px-4 text-sm font-bold text-on-surface-variant disabled:opacity-50"
                    >
                      <Icon name="sms" className="text-[18px]" /> New one-time password
                    </button>
                  ) : null}
                  {user?.role === "admin" ? (
                    <button
                      disabled={busyId === t.accountId}
                      onClick={async () => {
                        if (!confirm(`Delete ${t.canteenName} permanently? This cannot be undone.`)) return;
                        setBusyId(t.accountId);
                        // Sample rows never had a real login, so a backend
                        // "not found" must still clear them from the list.
                        const hasLogin = accounts.some((a) => a.id === t.accountId);
                        const res = hasLogin ? await removeAccount(t.accountId) : { ok: true };
                        setBusyId(null);
                        if (!res.ok) {
                          setActionError(res.error ?? "Could not delete that account.");
                          return;
                        }
                        setActionError("");
                        setOpenId(null);
                        setPicked((p) => p.filter((x) => x !== t.accountId));
                        removeTenant(t.accountId);
                        logAction(user?.name ?? "admin", `Deleted account ${t.canteenName}`);
                      }}
                      className="min-h-11 rounded-full px-4 text-sm font-bold text-tertiary underline disabled:opacity-50"
                    >
                      Delete permanently
                    </button>
                  ) : null}
                </div>

                {otp?.id === t.accountId ? (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-label="New one-time password"
                    onClick={() => setOtp(null)}
                  >
                    {(() => {
                      const acc = accounts.find((a) => a.id === t.accountId);
                      const msg = `Hello ${t.ownerName}, here is your new SmartCanteen one-time password: ${otp.code}\nPhone number to log in: +${acc?.phone ?? ""}\nOpen: ${loginLink}\nAfter signing in, set a new PIN in Settings.`;
                      return (
                        <div
                          className="w-full max-w-md space-y-4 rounded-2xl bg-surface p-5 shadow-2xl"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="text-lg font-extrabold text-on-surface">
                                New one-time password
                              </h3>
                              <p className="text-sm text-on-surface-variant">
                                For {t.ownerName} · +{acc?.phone ?? "no phone on file"} — their old
                                PIN no longer works.
                              </p>
                            </div>
                            <button
                              onClick={() => setOtp(null)}
                              aria-label="Close"
                              className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-on-surface-variant"
                            >
                              <Icon name="close" className="text-[22px]" />
                            </button>
                          </div>
                          <div className="rounded-xl bg-surface-high px-4 py-6 text-center">
                            <p className="text-4xl font-extrabold tracking-[0.35em] text-on-surface">
                              {otp.code}
                            </p>
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <a
                              href={whatsappLink(acc?.phone ?? undefined, msg) ?? "#"}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-on-primary"
                            >
                              <Icon name="chat" className="text-[18px]" /> Send on WhatsApp
                            </a>
                            <button
                              onClick={() => void navigator.clipboard?.writeText(msg)}
                              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border-2 border-outline-variant px-4 text-sm font-bold text-on-surface-variant"
                            >
                              <Icon name="content_copy" className="text-[18px]" /> Copy message
                            </button>
                          </div>
                          <p className="text-xs text-on-surface-variant">
                            Send this to the operator. They sign in with their phone number and this
                            password, then set a new PIN in Settings.
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                ) : null}

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
    </>
  );
}
