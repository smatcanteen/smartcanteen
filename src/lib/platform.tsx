import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./auth";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  loadLivePlatform,
  markAgentQuizPassed,
  savePlatformHub,
  submitAgentLead,
  submitSupportTicket,
  updateAgentLeadStage,
  updateSupportTicket,
  upsertTenantMeta,
} from "./platform.functions";

/* ------------------------------------------------------------------ types */

export type TenantStatus = "trial" | "active" | "past_due" | "suspended" | "churned";
export type CategoryTemplate = "boarding" | "day" | "university";
export type LeadStage = "contacted" | "demo" | "trial" | "subscribed" | "lost";
export type FollowUpTag = "nudge" | "hot" | "stalled";

export type Note = { id: string; text: string; ts: number };

export type Tenant = {
  /** Matches the operator's login account id. */
  accountId: string;
  canteenName: string;
  school: string;
  ownerName: string;
  phone: string;
  category: CategoryTemplate;
  zone: string;
  agentId: string | null;
  status: TenantStatus;
  createdAt: number;
  trialEndsAt: number | null;
  nextBillingAt: number;
  lastLoginAt: number | null;
  entries: number;
  tags: FollowUpTag[];
  notes: Note[];
  checklist: { loggedIn: boolean; capitalSet: boolean; firstStock: boolean; firstSale: boolean };
  termStart: string;
  termEnd: string;
};

export type Agent = {
  id: string;
  /** Login account id, when the agent has one. */
  accountId: string | null;
  name: string;
  phone: string;
  email: string;
  status: "pending" | "certified" | "suspended";
  territory: string;
  trainedAt: number | null;
  certified: boolean;
};

export type Lead = {
  id: string;
  school: string;
  contactName: string;
  phone: string;
  stage: LeadStage;
  agentId: string;
  notes: Note[];
  createdAt: number;
  /** Captured while offline and not yet synced. */
  queued?: boolean;
};

export type Commission = {
  id: string;
  agentId: string;
  accountId: string;
  type: "signup" | "trail";
  amount: number;
  period?: string;
  status: "pending" | "approved" | "paid" | "clawback";
  batchRef?: string;
  createdAt: number;
};

export type Payout = {
  id: string;
  agentId: string;
  amount: number;
  status: "requested" | "paid";
  ref?: string;
  ts: number;
};

export type TicketMessage = { id: string; from: "operator" | "admin"; text: string; ts: number };

export type Ticket = {
  id: string;
  accountId: string;
  accountName: string;
  subject: string;
  status: "open" | "in_progress" | "resolved";
  assignedTo: string | null;
  messages: TicketMessage[];
  createdAt: number;
};

export type AnnouncementAudience = "operators" | "agents" | "both";

export type Announcement = {
  id: string;
  title: string;
  body: string;
  active: boolean;
  ts: number;
  audience?: AnnouncementAudience;
  segment: { zone?: string; category?: CategoryTemplate; agentId?: string; recipientIds?: string[] };
};

export type PlatformSettings = {
  priceUGX: number;
  months: number;
  signupBonus: number;
  trailPct: number;
  clawbackDays: number;
  leaderboard: boolean;
  welcomeTemplate: string;
};

export type PlatformState = {
  tenants: Tenant[];
  agents: Agent[];
  leads: Lead[];
  commissions: Commission[];
  payouts: Payout[];
  tickets: Ticket[];
  announcements: Announcement[];
  settings: PlatformSettings;
  /** Audit log of read-only "view as operator" sessions and other support actions. */
  auditLog: { id: string; who: string; action: string; ts: number }[];
};

/* ------------------------------------------------------------------- seed */

const KEY = "smartcanteen.platform.v1";
const uid = () => Math.random().toString(36).slice(2, 10);

export const zones = ["Kampala Central", "Wakiso", "Jinja", "Mbarara", "Gulu"];

export const categoryLabels: Record<CategoryTemplate, string> = {
  boarding: "Boarding School",
  day: "Day School",
  university: "University Canteen",
};

export const statusLabels: Record<TenantStatus, string> = {
  trial: "Free trial",
  active: "Active",
  past_due: "Expired — read only",
  suspended: "Access suspended",
  churned: "Deactivated",
};

export function effectiveTenantStatus(tenant: Pick<Tenant, "status" | "nextBillingAt" | "trialEndsAt">, now = Date.now()): TenantStatus {
  if (tenant.status === "suspended" || tenant.status === "churned") return tenant.status;
  const end = tenant.status === "trial" ? (tenant.trialEndsAt ?? tenant.nextBillingAt) : tenant.nextBillingAt;
  return end <= now ? "past_due" : tenant.status;
}

async function sessionToken() {
  const { data: sessionData } = await supabase.auth.getSession();
  return sessionData.session?.access_token ?? null;
}

async function syncAgentLead(lead: Pick<Lead, "id" | "school" | "contactName" | "phone" | "stage" | "agentId" | "createdAt">) {
  const accessToken = await sessionToken();
  if (!accessToken) return { ok: false as const, error: "Your login expired. Log in again and retry." };
  return submitAgentLead({ data: { ...lead, accessToken, agentId: lead.agentId } });
}

async function persistHub(s: PlatformState) {
  const accessToken = await sessionToken();
  if (!accessToken) return;
  const tenantMeta: Record<string, any> = {};
  s.tenants.forEach((t) => {
    tenantMeta[t.accountId] = {
      canteenName: t.canteenName,
      school: t.school,
      category: t.category,
      zone: t.zone,
      agentAccountId: t.agentId,
      agentId: t.agentId,
      status: t.status,
      createdAt: t.createdAt,
      trialEndsAt: t.trialEndsAt,
      nextBillingAt: t.nextBillingAt,
      tags: t.tags,
      notes: t.notes,
      termStart: t.termStart,
      termEnd: t.termEnd,
    };
  });
  await savePlatformHub({
    data: {
      accessToken,
      settings: s.settings,
      commissions: s.commissions,
      payouts: s.payouts,
      announcements: s.announcements,
      tenantMeta,
    },
  });
}

export const stageLabels: Record<LeadStage, string> = {
  contacted: "Contacted",
  demo: "Demo given",
  trial: "Trial started",
  subscribed: "Subscribed",
  lost: "Lost",
};

export const tagLabels: Record<FollowUpTag, string> = {
  nudge: "Needs a nudge",
  hot: "Hot lead",
  stalled: "Stalled",
};

const defaultSettings: PlatformSettings = {
  priceUGX: 35000,
  months: 4,
  signupBonus: 10000,
  trailPct: 10,
  clawbackDays: 60,
  leaderboard: true,
  welcomeTemplate:
    "Hello {name}, welcome to SmartCanteen! Open {link} and log in with phone {phone} and the one-time password {password}. You will then choose your own private PIN. Your first job is to set your opening term capital — everything else follows from it.",
};

const seed: PlatformState = {
  agents: [],
  tenants: [],
  leads: [],
  commissions: [],
  payouts: [],
  tickets: [],
  announcements: [],
  settings: defaultSettings,
  auditLog: [],
};

/* --------------------------------------------------------------- provider */

type Ctx = {
  s: PlatformState;
  hydrated: boolean;
  /* tenants */
  addTenant: (t: Omit<Tenant, "createdAt" | "notes" | "lastLoginAt" | "entries"> & { initialNote?: string }) => void;
  updateTenant: (accountId: string, patch: Partial<Tenant>) => void;
  removeTenant: (accountId: string) => void;
  addTenantNote: (accountId: string, text: string) => void;
  toggleTag: (accountId: string, tag: FollowUpTag) => void;
  bulkStatus: (accountIds: string[], status: TenantStatus) => void;
  /* agents */
  addAgent: (a: Omit<Agent, "id" | "trainedAt" | "certified" | "status">) => Agent;
  updateAgent: (id: string, patch: Partial<Agent>) => void;
  certifyAgent: (id: string) => void;
  /* leads */
  addLead: (l: Omit<Lead, "id" | "createdAt" | "notes">) => Promise<{ ok: boolean; error?: string }>;
  setLeadStage: (id: string, stage: LeadStage) => void;
  addLeadNote: (id: string, text: string) => void;
  /* commissions & payouts */
  addCommission: (c: Omit<Commission, "id" | "createdAt">) => void;
  setCommissionStatus: (id: string, status: Commission["status"], batchRef?: string) => void;
  requestPayout: (agentId: string, amount: number) => void;
  markPayoutPaid: (id: string, ref: string) => void;
  /* support */
  openTicket: (accountId: string, accountName: string, subject: string, text: string) => void;
  replyTicket: (id: string, from: "operator" | "admin", text: string) => void;
  setTicketStatus: (id: string, status: Ticket["status"], assignedTo?: string) => void;
  /* broadcasts + settings */
  addAnnouncement: (a: Omit<Announcement, "id" | "ts" | "active">) => void;
  toggleAnnouncement: (id: string) => void;
  updateSettings: (patch: Partial<PlatformSettings>) => void;
  logAction: (who: string, action: string) => void;
};

const PlatformContext = createContext<Ctx | null>(null);

export function PlatformProvider({ children }: { children: ReactNode }) {
  const { accounts, ready: accountsReady, user } = useAuth();
  const [s, setS] = useState<PlatformState>(seed);
  const [hydrated, setHydrated] = useState(false);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (!accountsReady || !user) {
      if (accountsReady && !user) setHydrated(true);
      return;
    }
    let alive = true;
    const load = async () => {
      const accessToken = await sessionToken();
      if (!accessToken) {
        if (alive) setHydrated(true);
        return;
      }
      const result = await loadLivePlatform({ data: { accessToken } });
      if (!alive) return;
      if (result.ok && result.platform) {
        setS({
          ...seed,
          ...result.platform,
          settings: { ...defaultSettings, ...(result.platform.settings as PlatformSettings) },
          announcements: (result.platform.announcements ?? []).map((a: Announcement) => ({
            ...a,
            audience: a.audience ?? "operators",
          })),
        });
      }
      setHydrated(true);
    };
    void load();
    const timer = window.setInterval(() => void load(), 8000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [accountsReady, user?.id, user?.role]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }, [s, hydrated]);

  useEffect(() => {
    if (!hydrated || !user) return;
    if (!["admin", "support", "finance"].includes(user.role)) return;
    if (!navigator.onLine) {
      pendingRef.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      void persistHub(s).then(() => {
        pendingRef.current = false;
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [s.settings, s.commissions, s.payouts, s.announcements, s.tenants, hydrated, user?.role]);

  useEffect(() => {
    const flush = () => {
      if (!pendingRef.current || !user || !["admin", "support", "finance"].includes(user.role)) return;
      void persistHub(s).then(() => {
        pendingRef.current = false;
      });
    };
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [s, user]);

  useEffect(() => {
    if (!hydrated || user?.role !== "admin") return;
    const expireEndedSubscriptions = () => setS((current) => {
      let changed = false;
      const tenants = current.tenants.map((tenant) => {
        const status = effectiveTenantStatus(tenant);
        if (status === tenant.status) return tenant;
        changed = true;
        return { ...tenant, status };
      });
      return changed ? { ...current, tenants } : current;
    });
    expireEndedSubscriptions();
    const timer = window.setInterval(expireEndedSubscriptions, 60_000);
    return () => window.clearInterval(timer);
  }, [hydrated, user?.role]);

  const patch = useCallback((fn: (prev: PlatformState) => PlatformState) => setS(fn), []);

  const value = useMemo<Ctx>(() => {
    const note = (text: string): Note => ({ id: uid(), text, ts: Date.now() });
    return {
      s,
      hydrated,
      addTenant: (t) =>
        patch((p) => {
          const { initialNote, ...tenant } = t;
          return {
            ...p,
            tenants: [
              ...p.tenants,
              {
                ...tenant,
                createdAt: Date.now(),
                notes: initialNote?.trim() ? [note(initialNote.trim())] : [],
                lastLoginAt: null,
                entries: 0,
              },
            ],
          };
        }),
      updateTenant: (accountId, upd) => {
        patch((p) => ({
          ...p,
          tenants: p.tenants.map((t) => (t.accountId === accountId ? { ...t, ...upd } : t)),
        }));
        void sessionToken().then((accessToken) => {
          if (!accessToken) return;
          void upsertTenantMeta({ data: { accessToken, accountId, patch: upd } });
        });
      },
      removeTenant: (accountId) =>
        patch((p) => ({
          ...p,
          tenants: p.tenants.filter((t) => t.accountId !== accountId),
          commissions: p.commissions.filter((c) => c.accountId !== accountId),
          tickets: p.tickets.filter((t) => t.accountId !== accountId),
        })),
      addTenantNote: (accountId, text) =>
        patch((p) => ({
          ...p,
          tenants: p.tenants.map((t) =>
            t.accountId === accountId ? { ...t, notes: [note(text), ...t.notes] } : t,
          ),
        })),
      toggleTag: (accountId, tag) =>
        patch((p) => ({
          ...p,
          tenants: p.tenants.map((t) =>
            t.accountId === accountId
              ? {
                  ...t,
                  tags: t.tags.includes(tag) ? t.tags.filter((x) => x !== tag) : [...t.tags, tag],
                }
              : t,
          ),
        })),
      bulkStatus: (ids, status) =>
        patch((p) => ({
          ...p,
          tenants: p.tenants.map((t) => (ids.includes(t.accountId) ? { ...t, status } : t)),
        })),
      addAgent: (a) => {
        // Agent id is always the login account id when one exists.
        const id = a.accountId || uid();
        const agent: Agent = { ...a, id, accountId: a.accountId ?? id, status: "pending", trainedAt: null, certified: false };
        patch((p) => ({ ...p, agents: [...p.agents.filter((x) => x.id !== id && x.accountId !== id), agent] }));
        return agent;
      },
      updateAgent: (id, upd) =>
        patch((p) => ({ ...p, agents: p.agents.map((a) => (a.id === id ? { ...a, ...upd } : a)) })),
      certifyAgent: (id) => {
        patch((p) => ({
          ...p,
          agents: p.agents.map((a) =>
            a.id === id ? { ...a, certified: true, status: "certified", trainedAt: Date.now() } : a,
          ),
        }));
        const agent = s.agents.find((a) => a.id === id);
        const accountId = agent?.accountId ?? id;
        void sessionToken().then((accessToken) => {
          if (!accessToken) return;
          void import("./platform.functions").then(({ setAgentCertification }) =>
            setAgentCertification({ data: { accessToken, agentAccountId: accountId, certified: true } }),
          );
        });
      },
      addLead: async (l) => {
        const agentId = user?.id ?? l.agentId;
        const lead = { ...l, agentId, id: uid(), createdAt: Date.now(), notes: [], queued: true };
        patch((p) => ({ ...p, leads: [lead, ...p.leads.filter((item) => item.id !== lead.id)] }));
        try {
          const result = await syncAgentLead({
            id: lead.id,
            school: lead.school,
            contactName: lead.contactName,
            phone: lead.phone,
            stage: lead.stage,
            agentId,
            createdAt: lead.createdAt,
          });
          if (!result.ok) return { ok: false, error: result.error };
          patch((p) => ({ ...p, leads: p.leads.map((item) => item.id === lead.id ? { ...item, queued: false } : item) }));
          return { ok: true };
        } catch (error) {
          const detail = error instanceof Error ? error.message : typeof error === "string" ? error : "The Admin connection rejected the request.";
          return { ok: false, error: navigator.onLine ? detail : "Saved on this device. Reconnect and try again." };
        }
      },
      setLeadStage: (id, stage) => {
        const lead = s.leads.find((item) => item.id === id);
        patch((p) => ({ ...p, leads: p.leads.map((l) => (l.id === id ? { ...l, stage, queued: false } : l)) }));
        void sessionToken().then((accessToken) => {
          if (!accessToken || !lead) return;
          void updateAgentLeadStage({
            data: {
              accessToken,
              agentAccountId: (lead as any).agentAccountId ?? lead.agentId,
              leadId: id,
              stage,
            },
          });
        });
      },
      addLeadNote: (id, text) =>
        patch((p) => ({
          ...p,
          leads: p.leads.map((l) => (l.id === id ? { ...l, notes: [note(text), ...l.notes] } : l)),
        })),
      addCommission: (c) =>
        patch((p) => ({ ...p, commissions: [{ ...c, id: uid(), createdAt: Date.now() }, ...p.commissions] })),
      setCommissionStatus: (id, status, batchRef) =>
        patch((p) => ({
          ...p,
          commissions: p.commissions.map((c) =>
            c.id === id ? { ...c, status, ...(batchRef ? { batchRef } : {}) } : c,
          ),
        })),
      requestPayout: (agentId, amount) =>
        patch((p) => ({
          ...p,
          payouts: [{ id: uid(), agentId, amount, status: "requested", ts: Date.now() }, ...p.payouts],
        })),
      markPayoutPaid: (id, ref) =>
        patch((p) => ({
          ...p,
          payouts: p.payouts.map((x) => (x.id === id ? { ...x, status: "paid", ref } : x)),
        })),
      openTicket: (accountId, accountName, subject, text) => {
        const id = uid();
        const messageId = uid();
        const createdAt = Date.now();
        patch((p) => ({
          ...p,
          tickets: [
            {
              id,
              accountId,
              accountName,
              subject,
              status: "open",
              assignedTo: null,
              messages: [{ id: messageId, from: "operator", text, ts: createdAt }],
              createdAt,
            },
            ...p.tickets,
          ],
        }));
        void supabase.auth.getSession().then(({ data }) => {
          const accessToken = data.session?.access_token;
          if (accessToken) void submitSupportTicket({ data: { accessToken, id, accountId, accountName, subject, text, createdAt, messageId } });
        });
      },
      replyTicket: (id, from, text) => {
        const messageId = uid();
        const ts = Date.now();
        patch((p) => ({
          ...p,
          tickets: p.tickets.map((t) =>
            t.id === id
              ? {
                  ...t,
                  status: from === "admin" && t.status === "open" ? "in_progress" : from === "operator" && t.status === "resolved" ? "open" : t.status,
                  messages: [...t.messages, { id: messageId, from, text, ts }],
                }
              : t,
          ),
        }));
        if (from === "operator") void supabase.auth.getSession().then(({ data }) => {
          const accessToken = data.session?.access_token;
          const ticket = s.tickets.find((item) => item.id === id);
          if (accessToken && ticket) void updateSupportTicket({ data: { accessToken, accountId: ticket.accountId, ticketId: id, message: { id: messageId, from, text, ts } } });
        });
      },
      setTicketStatus: (id, status, assignedTo) =>
        patch((p) => ({
          ...p,
          tickets: p.tickets.map((t) =>
            t.id === id ? { ...t, status, assignedTo: assignedTo ?? t.assignedTo } : t,
          ),
        })),
      addAnnouncement: (a) =>
        patch((p) => ({
          ...p,
          announcements: [{ ...a, id: uid(), ts: Date.now(), active: true }, ...p.announcements],
        })),
      toggleAnnouncement: (id) =>
        patch((p) => ({
          ...p,
          announcements: p.announcements.map((a) => (a.id === id ? { ...a, active: !a.active } : a)),
        })),
      updateSettings: (upd) => patch((p) => ({ ...p, settings: { ...p.settings, ...upd } })),
      logAction: (who, action) =>
        patch((p) => ({ ...p, auditLog: [{ id: uid(), who, action, ts: Date.now() }, ...p.auditLog] })),
    };
  }, [s, hydrated, patch, user?.id]);

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform() {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error("usePlatform must be used inside PlatformProvider");
  return ctx;
}

/* ------------------------------------------------------------- selectors */

/** An account counts as activated once it has posted a real entry. */
export const isActivated = (t: Tenant) => t.entries > 0 && t.checklist.firstSale;
export const isStalled = (t: Tenant) => t.checklist.loggedIn && !t.checklist.capitalSet;
export const checklistDone = (t: Tenant) =>
  Object.values(t.checklist).filter(Boolean).length;

export const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Churn rate of the accounts an agent onboarded, used for the quality flag. */
export function agentChurnRate(agentId: string, tenants: Tenant[]) {
  const mine = tenants.filter((t) => t.agentId === agentId);
  if (!mine.length) return 0;
  return mine.filter((t) => t.status === "churned").length / mine.length;
}
