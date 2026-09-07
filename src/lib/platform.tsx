import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

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

export type Announcement = {
  id: string;
  title: string;
  body: string;
  active: boolean;
  ts: number;
  segment: { zone?: string; category?: CategoryTemplate; agentId?: string };
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
const ANCHOR = Date.UTC(2026, 7, 14, 9, 0, 0);
const days = (n: number) => ANCHOR - n * 86400000;
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
  past_due: "Past due",
  suspended: "Suspended",
  churned: "Churned",
};

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

const seedTenant = (
  accountId: string,
  canteenName: string,
  school: string,
  ownerName: string,
  phone: string,
  category: CategoryTemplate,
  zone: string,
  agentId: string | null,
  status: TenantStatus,
  createdDaysAgo: number,
  entries: number,
  checklist: Tenant["checklist"],
  tags: FollowUpTag[] = [],
): Tenant => ({
  accountId,
  canteenName,
  school,
  ownerName,
  phone,
  category,
  zone,
  agentId,
  status,
  createdAt: days(createdDaysAgo),
  trialEndsAt: status === "trial" ? days(createdDaysAgo - 14) : null,
  nextBillingAt: days(createdDaysAgo - 120),
  lastLoginAt: entries > 0 ? days(1) : null,
  entries,
  tags,
  notes: [],
  checklist,
  termStart: "2026-05-25",
  termEnd: "2026-08-28",
});

const seed: PlatformState = {
  agents: [
    {
      id: "ag-1",
      accountId: "acc-agent-1",
      name: "Moses Kigozi",
      phone: "+256 700 000 020",
      email: "agent@smartcanteen.app",
      status: "certified",
      territory: "Kampala Central",
      trainedAt: days(95),
      certified: true,
    },
    {
      id: "ag-2",
      accountId: "acc-agent-2",
      name: "Sarah Kembabazi",
      phone: "+256 700 000 021",
      email: "sarah.agent@smartcanteen.app",
      status: "pending",
      territory: "Wakiso",
      trainedAt: null,
      certified: false,
    },
  ],
  tenants: [
    seedTenant(
      "acc-op-1",
      "Kampala Parents Canteen",
      "Kampala Parents SS",
      "Talemwa Raymond",
      "+256 700 000 002",
      "day",
      "Kampala Central",
      "ag-1",
      "active",
      120,
      42,
      { loggedIn: true, capitalSet: true, firstStock: true, firstSale: true },
    ),
    seedTenant(
      "acc-op-2",
      "St. Mary's Canteen",
      "St. Mary's SS",
      "Grace Nabirye",
      "+256 700 000 003",
      "boarding",
      "Wakiso",
      "ag-1",
      "active",
      90,
      31,
      { loggedIn: true, capitalSet: true, firstStock: true, firstSale: true },
    ),
    seedTenant(
      "acc-op-3",
      "Kololo High Canteen",
      "Kololo High",
      "Peter Wanyama",
      "+256 700 000 004",
      "boarding",
      "Kampala Central",
      "ag-2",
      "trial",
      6,
      0,
      { loggedIn: true, capitalSet: false, firstStock: false, firstSale: false },
      ["nudge"],
    ),
  ],
  leads: [
    {
      id: "ld-1",
      school: "Namilyango College",
      contactName: "Bursar Okot",
      phone: "+256 772 111 222",
      stage: "demo",
      agentId: "ag-1",
      notes: [{ id: "n1", text: "Demo given to the bursar; wants board approval.", ts: days(4) }],
      createdAt: days(9),
    },
    {
      id: "ld-2",
      school: "Seeta High School",
      contactName: "Madam Night",
      phone: "+256 772 333 444",
      stage: "contacted",
      agentId: "ag-1",
      notes: [],
      createdAt: days(3),
    },
    {
      id: "ld-3",
      school: "Mengo SS",
      contactName: "Mr. Kato",
      phone: "+256 772 555 666",
      stage: "trial",
      agentId: "ag-2",
      notes: [],
      createdAt: days(7),
    },
  ],
  commissions: [
    {
      id: "cm-1",
      agentId: "ag-1",
      accountId: "acc-op-1",
      type: "signup",
      amount: 10000,
      status: "paid",
      batchRef: "MM-88213",
      createdAt: days(118),
    },
    {
      id: "cm-2",
      agentId: "ag-1",
      accountId: "acc-op-2",
      type: "signup",
      amount: 10000,
      status: "approved",
      createdAt: days(88),
    },
    {
      id: "cm-3",
      agentId: "ag-1",
      accountId: "acc-op-1",
      type: "trail",
      amount: 875,
      period: "Aug 2026",
      status: "pending",
      createdAt: days(10),
    },
  ],
  payouts: [{ id: "po-1", agentId: "ag-1", amount: 10000, status: "paid", ref: "MM-88213", ts: days(80) }],
  tickets: [
    {
      id: "tk-1",
      accountId: "acc-op-2",
      accountName: "Grace Nabirye",
      subject: "Stock not reducing after a sale",
      status: "open",
      assignedTo: null,
      messages: [
        {
          id: "m1",
          from: "operator",
          text: "When I sell mandazi the stock number stays the same. Please help.",
          ts: days(2),
        },
      ],
      createdAt: days(2),
    },
  ],
  announcements: [
    {
      id: "an-1",
      title: "Welcome",
      body: "We are happy you are using SmartCanteen to manage your expenses and cash.",
      active: true,
      ts: days(3),
      segment: {},
    },
  ],
  settings: defaultSettings,
  auditLog: [],
};

/* --------------------------------------------------------------- provider */

type Ctx = {
  s: PlatformState;
  hydrated: boolean;
  /* tenants */
  addTenant: (t: Omit<Tenant, "createdAt" | "notes" | "lastLoginAt" | "entries">) => void;
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
  addLead: (l: Omit<Lead, "id" | "createdAt" | "notes">) => void;
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
  const [s, setS] = useState<PlatformState>(seed);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setS({ ...seed, ...(JSON.parse(raw) as PlatformState) });
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }, [s, hydrated]);

  const patch = useCallback((fn: (prev: PlatformState) => PlatformState) => setS(fn), []);

  const value = useMemo<Ctx>(() => {
    const note = (text: string): Note => ({ id: uid(), text, ts: Date.now() });
    return {
      s,
      hydrated,
      addTenant: (t) =>
        patch((p) => ({
          ...p,
          tenants: [
            ...p.tenants,
            { ...t, createdAt: Date.now(), notes: [], lastLoginAt: null, entries: 0 },
          ],
        })),
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
      addLead: (l) =>
        patch((p) => ({ ...p, leads: [{ ...l, id: uid(), createdAt: Date.now(), notes: [] }, ...p.leads] })),
      setLeadStage: (id, stage) =>
        patch((p) => ({ ...p, leads: p.leads.map((l) => (l.id === id ? { ...l, stage } : l)) })),
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
      openTicket: (accountId, accountName, subject, text) =>
        patch((p) => ({
          ...p,
          tickets: [
            {
              id: uid(),
              accountId,
              accountName,
              subject,
              status: "open",
              assignedTo: null,
              messages: [{ id: uid(), from: "operator", text, ts: Date.now() }],
              createdAt: Date.now(),
            },
            ...p.tickets,
          ],
        })),
      replyTicket: (id, from, text) =>
        patch((p) => ({
          ...p,
          tickets: p.tickets.map((t) =>
            t.id === id
              ? {
                  ...t,
                  status: from === "admin" && t.status === "open" ? "in_progress" : t.status,
                  messages: [...t.messages, { id: uid(), from, text, ts: Date.now() }],
                }
              : t,
          ),
        })),
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
