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
    if (!accountsReady) return;
    let alive = true;
    const localState = () => {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) return { ...seed, ...(JSON.parse(raw) as PlatformState) };
      } catch {
        /* use empty state */
      }
      return seed;
    };
    const clean = (saved: PlatformState) => {
      const isLegacyDemoId = (id: string | null) => !!id && id.startsWith("acc-");
      return {
        ...saved,
        tenants: saved.tenants.filter((tenant) => !isLegacyDemoId(tenant.accountId)),
        agents: saved.agents.filter((agent) => !isLegacyDemoId(agent.accountId)),
        commissions: saved.commissions.filter((commission) => !isLegacyDemoId(commission.accountId)),
        leads: saved.leads.filter((lead) => saved.agents.some((agent) => !isLegacyDemoId(agent.accountId) && agent.id === lead.agentId)),
        tickets: saved.tickets.filter((ticket) => !isLegacyDemoId(ticket.accountId)),
        announcements: saved.announcements.map((announcement) => ({
          ...announcement,
          audience: announcement.audience ?? "operators",
        })),
      };
    };
    setS(clean(localState()));
    void supabase
      .from("platform_state")
      .select("data")
      .eq("id", "shared")
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        if (!error && data?.data && Object.keys(data.data as object).length) {
          const shared = clean({ ...seed, ...(data.data as unknown as PlatformState) });
          if (user?.role === "operator") {
            const ownTenant = shared.tenants.find((tenant) => tenant.accountId === user.id);
            setS((local) => ({
              ...local,
              announcements: shared.announcements,
              tickets: shared.tickets.filter((ticket) => ticket.accountId === user.id),
              tenants: ownTenant
                ? [...local.tenants.filter((tenant) => tenant.accountId !== user.id), ownTenant]
                : local.tenants,
            }));
          } else if (user?.role === "agent") {
            const ownAgent = shared.agents.find((agent) => agent.accountId === user.id);
            const localOwnLeads = ownAgent
              ? clean(localState()).leads.filter((lead) => lead.agentId === ownAgent.id)
              : [];
            const sharedIds = new Set(shared.leads.map((lead) => lead.id));
            const unsynced = localOwnLeads.filter((lead) => !sharedIds.has(lead.id));
            setS({ ...shared, leads: [...unsynced, ...shared.leads] });
            unsynced.forEach((lead) => {
              void syncAgentLead({
                id: lead.id,
                school: lead.school,
                contactName: lead.contactName,
                phone: lead.phone,
                stage: lead.stage,
                agentId: lead.agentId,
                createdAt: lead.createdAt,
              });
            });
          } else {
            setS(shared);
          }
        }
        setHydrated(true);
      });
    const fallback = window.setTimeout(() => alive && setHydrated(true), 3000);
    return () => {
      alive = false;
      window.clearTimeout(fallback);
    };
  }, [accountsReady, user?.id, user?.role]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
    const mayShare = user?.role === "agent" || user?.role === "admin" || user?.role === "support" || user?.role === "finance";
    if (!mayShare || !navigator.onLine) {
      if (mayShare) pendingRef.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      void supabase
        .from("platform_state")
        .update({ data: s as unknown as Json, updated_at: new Date().toISOString() })
        .eq("id", "shared")
        .then(({ error }) => {
          pendingRef.current = !!error;
        });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [s, hydrated, user?.role]);

  useEffect(() => {
    if (!hydrated || user?.role !== "agent" || !navigator.onLine || !s.leads.length) return;
    let active = true;
    const syncSavedLeads = () => {
      s.leads.forEach((lead) => {
        void syncAgentLead({
          id: lead.id,
          school: lead.school,
          contactName: lead.contactName,
          phone: lead.phone,
          stage: lead.stage,
          agentId: lead.agentId,
          createdAt: lead.createdAt,
        }).then((result) => {
          if (!active || !result.ok) return;
          setS((current) => ({
            ...current,
            leads: current.leads.map((item) => item.id === lead.id ? { ...item, queued: false } : item),
          }));
        });
      });
    };
    syncSavedLeads();
    const timer = window.setInterval(syncSavedLeads, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [hydrated, user?.role, s.leads]);

  useEffect(() => {
    const flush = () => {
      if (!pendingRef.current || !user || user.role === "operator") return;
      void supabase
        .from("platform_state")
        .update({ data: s as unknown as Json, updated_at: new Date().toISOString() })
        .eq("id", "shared")
        .then(({ error }) => {
          pendingRef.current = !!error;
        });
    };
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [s, user]);

  useEffect(() => {
    if (!hydrated || !accountsReady) return;
    const operatorIds = new Set(
      accounts.filter((account) => account.role === "operator").map((account) => account.id),
    );
    const agentIds = new Set(
      accounts.filter((account) => account.role === "agent").map((account) => account.id),
    );
    setS((current) => {
      const tenants = current.tenants.filter((tenant) => operatorIds.has(tenant.accountId));
      const agents = current.agents.filter(
        (agent) => !!agent.accountId && agentIds.has(agent.accountId),
      );

      // Accounts registered on another device (or before this browser had a
      // local copy) must still show up in the admin console, so build the
      // missing rows straight from the backend account directory.
      const day = 86400000;
      const iso = (ts: number) => new Date(ts).toISOString().slice(0, 10);
      const knownTenants = new Set(tenants.map((t) => t.accountId));
      const knownAgents = new Set(agents.map((a) => a.accountId));
      let added = 0;

      accounts.forEach((account) => {
        if (account.role === "operator" && !knownTenants.has(account.id)) {
          added += 1;
          tenants.push({
            accountId: account.id,
            canteenName: account.school || account.name,
            school: account.school,
            ownerName: account.name,
            phone: account.phone ?? "",
            category: "day",
            zone: zones.includes(account.school) ? account.school : zones[0]!,
            agentId: null,
            status: "trial",
            createdAt: account.createdAt,
            trialEndsAt: account.createdAt + 30 * day,
            nextBillingAt: account.createdAt + 30 * day,
            lastLoginAt: null,
            entries: 0,
            tags: [],
            notes: [],
            checklist: { loggedIn: false, capitalSet: false, firstStock: false, firstSale: false },
            termStart: iso(account.createdAt),
            termEnd: iso(account.createdAt + 120 * day),
          });
        }
        if (account.role === "agent" && !knownAgents.has(account.id)) {
          added += 1;
          agents.push({
            id: uid(),
            accountId: account.id,
            name: account.name,
            phone: account.phone ?? "",
            email: account.email,
            status: "pending",
            territory: zones.includes(account.school) ? account.school : zones[0]!,
            trainedAt: null,
            certified: false,
          });
        }
      });

      const tenantIds = new Set(tenants.map((tenant) => tenant.accountId));
      const keptAgentIds = new Set(agents.map((agent) => agent.id));
      const next = {
        ...current,
        tenants,
        agents,
        commissions: current.commissions.filter(
          (commission) => tenantIds.has(commission.accountId) && keptAgentIds.has(commission.agentId),
        ),
        leads: current.leads.filter((lead) => keptAgentIds.has(lead.agentId)),
        tickets: current.tickets.filter((ticket) => tenantIds.has(ticket.accountId)),
      };
      if (
        added === 0 &&
        next.tenants.length === current.tenants.length &&
        next.agents.length === current.agents.length &&
        next.commissions.length === current.commissions.length &&
        next.leads.length === current.leads.length &&
        next.tickets.length === current.tickets.length
      ) {
        return current;
      }
      return next;
    });
  }, [accounts, accountsReady, hydrated]);


  useEffect(() => {
    if (!hydrated || !user || ["operator", "agent"].includes(user.role)) return;
    const applyShared = (data?: PlatformState) => {
      if (data) setS(clean({ ...seed, ...data }));
    };
    const channel = supabase
      .channel("admin-platform-state")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "platform_state", filter: "id=eq.shared" },
        (payload) => applyShared((payload.new as { data?: PlatformState }).data),
      )
      .subscribe();
    const poll = window.setInterval(() => {
      void supabase.from("platform_state").select("data").eq("id", "shared").single().then(({ data }) => {
        applyShared(data?.data as unknown as PlatformState | undefined);
      });
    }, 10_000);
    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [hydrated, user]);

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
      updateTenant: (accountId, upd) =>
        patch((p) => ({
          ...p,
          tenants: p.tenants.map((t) => (t.accountId === accountId ? { ...t, ...upd } : t)),
        })),
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
        const agent: Agent = { ...a, id: uid(), status: "pending", trainedAt: null, certified: false };
        patch((p) => ({ ...p, agents: [...p.agents, agent] }));
        return agent;
      },
      updateAgent: (id, upd) =>
        patch((p) => ({ ...p, agents: p.agents.map((a) => (a.id === id ? { ...a, ...upd } : a)) })),
      certifyAgent: (id) =>
        patch((p) => ({
          ...p,
          agents: p.agents.map((a) =>
            a.id === id ? { ...a, certified: true, status: "certified", trainedAt: Date.now() } : a,
          ),
        })),
      addLead: async (l) => {
        const lead = { ...l, id: uid(), createdAt: Date.now(), notes: [], queued: true };
        patch((p) => ({ ...p, leads: [lead, ...p.leads.filter((item) => item.id !== lead.id)] }));
        try {
          const result = await syncAgentLead({
            id: lead.id,
            school: lead.school,
            contactName: lead.contactName,
            phone: lead.phone,
            stage: lead.stage,
            agentId: lead.agentId,
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
      setLeadStage: (id, stage) =>
        patch((p) => ({ ...p, leads: p.leads.map((l) => (l.id === id ? { ...l, stage, queued: false } : l)) })),
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
  }, [s, hydrated, patch]);

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
