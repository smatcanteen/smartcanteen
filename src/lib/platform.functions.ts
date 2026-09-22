import { createServerFn } from "@tanstack/react-start";

type LeadInput = {
  accessToken: string;
  id: string;
  school: string;
  contactName: string;
  phone: string;
  stage: "contacted" | "demo" | "trial" | "subscribed" | "lost";
  agentId: string;
  createdAt: number;
};

type TicketInput = {
  id: string;
  accountId: string;
  accountName: string;
  subject: string;
  text: string;
  createdAt: number;
  messageId: string;
};

type PlatformHub = {
  settings?: Record<string, unknown>;
  commissions?: any[];
  payouts?: any[];
  announcements?: any[];
  tenantMeta?: Record<string, any>;
  updatedAt?: number;
};

const defaultSettings = {
  priceUGX: 35000,
  months: 4,
  signupBonus: 10000,
  trailPct: 10,
  clawbackDays: 60,
  leaderboard: true,
  welcomeTemplate:
    "Hello {name}, welcome to SmartCanteen! Open {link} and log in with phone {phone} and the one-time password {password}. You will then choose your own private PIN. Your first job is to set your opening term capital — everything else follows from it.",
};

async function authenticatedUser(accessToken: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("Your login expired. Log in again.");
  return { supabaseAdmin, userId: data.user.id };
}

async function requireStaff(accessToken: string) {
  const auth = await authenticatedUser(accessToken);
  const { data: roles } = await auth.supabaseAdmin.from("user_roles").select("role").eq("user_id", auth.userId);
  if (!(roles ?? []).some((row: any) => ["admin", "support", "finance"].includes(row.role))) {
    throw new Error("Admin access is required.");
  }
  return auth;
}

async function readBook(supabaseAdmin: any, userId: string) {
  const { data, error } = await supabaseAdmin.from("canteen_books").select("data, revision").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return { data: (data?.data ?? {}) as any, revision: data?.revision ?? 0 };
}

async function writeBook(supabaseAdmin: any, userId: string, data: any, revision: number) {
  const { error } = await supabaseAdmin.from("canteen_books").upsert({
    user_id: userId,
    data,
    revision: revision + 1,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

function checklistFromBook(book: any, lastLoginAt: number | null) {
  const txs: any[] = Array.isArray(book?.txs) ? book.txs : [];
  const capital = Number(book?.capital ?? 0);
  return {
    loggedIn: !!lastLoginAt,
    capitalSet: capital > 0 || txs.some((t) => t.type === "capital"),
    firstStock: txs.some((t) => t.type === "stock"),
    firstSale: txs.some((t) => t.type === "sale"),
    entries: txs.filter((t) => t.type !== "capital").length,
  };
}

function pickHub(books: any[], staffIds: string[]): PlatformHub {
  let best: PlatformHub = {};
  let bestAt = 0;
  for (const book of books) {
    if (!staffIds.includes(book.user_id)) continue;
    const hub = (book.data?.platformHub ?? {}) as PlatformHub;
    const at = Number(hub.updatedAt ?? 0);
    if (at >= bestAt) {
      best = hub;
      bestAt = at;
    }
  }
  return best;
}

export const loadLivePlatform = createServerFn({ method: "POST" })
  .inputValidator((data: { accessToken: string }) => data)
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin, userId } = await authenticatedUser(data.accessToken);
      const { data: roleRows } = await supabaseAdmin.from("user_roles").select("user_id, role");
      const rolesByUser = new Map<string, string[]>();
      (roleRows ?? []).forEach((row: any) => {
        const list = rolesByUser.get(row.user_id) ?? [];
        list.push(row.role);
        rolesByUser.set(row.user_id, list);
      });
      const myRoles = rolesByUser.get(userId) ?? [];
      const isStaff = myRoles.some((r) => ["admin", "support", "finance"].includes(r));
      const isAgent = myRoles.includes("agent");
      const isOperator = myRoles.includes("operator");

      const [{ data: profiles }, { data: books }] = await Promise.all([
        supabaseAdmin.from("profiles").select("id, full_name, school, phone, email, last_login_at, active, created_at"),
        supabaseAdmin.from("canteen_books").select("user_id, data, updated_at"),
      ]);

      const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      const bookById = new Map((books ?? []).map((b: any) => [b.user_id, b]));
      const staffIds = [...rolesByUser.entries()]
        .filter(([, roles]) => roles.some((r) => ["admin", "support", "finance"].includes(r)))
        .map(([id]) => id);
      const hub = pickHub(books ?? [], staffIds);
      const tenantMeta = hub.tenantMeta ?? {};

      const agents = [...rolesByUser.entries()]
        .filter(([, roles]) => roles.includes("agent"))
        .map(([accountId]) => {
          const profile = profileById.get(accountId);
          const book = bookById.get(accountId)?.data ?? {};
          const admin = book.agentAdmin ?? {};
          return {
            id: accountId,
            accountId,
            name: profile?.full_name ?? "Field agent",
            phone: profile?.phone ?? "",
            email: profile?.email ?? "",
            status: admin.status ?? (admin.certified ? "certified" : "pending"),
            territory: admin.territory ?? profile?.school ?? "Kampala Central",
            trainedAt: admin.trainedAt ?? null,
            certified: !!admin.certified,
            quizPassed: !!admin.quizPassed,
            leads: Array.isArray(book.agentLeads) ? book.agentLeads : [],
          };
        });

      const tenants = [...rolesByUser.entries()]
        .filter(([, roles]) => roles.includes("operator"))
        .map(([accountId]) => {
          const profile = profileById.get(accountId);
          const book = bookById.get(accountId)?.data ?? {};
          const meta = { ...(book.operatorMeta ?? {}), ...(tenantMeta[accountId] ?? {}) };
          const lastLoginAt = profile?.last_login_at ? new Date(profile.last_login_at).getTime() : null;
          const check = checklistFromBook(book, lastLoginAt);
          const createdAt = meta.createdAt ?? (profile?.created_at ? new Date(profile.created_at).getTime() : Date.now());
          const day = 86400000;
          return {
            accountId,
            canteenName: meta.canteenName || profile?.full_name || "Canteen",
            school: meta.school || profile?.school || "",
            ownerName: profile?.full_name || "",
            phone: profile?.phone ?? "",
            category: meta.category || "day",
            zone: meta.zone || "Kampala Central",
            agentId: meta.agentAccountId || meta.agentId || null,
            status: meta.status || "trial",
            createdAt,
            trialEndsAt: meta.trialEndsAt ?? createdAt + 30 * day,
            nextBillingAt: meta.nextBillingAt ?? createdAt + 30 * day,
            lastLoginAt,
            entries: check.entries,
            tags: Array.isArray(meta.tags) ? meta.tags : [],
            notes: Array.isArray(meta.notes) ? meta.notes : [],
            checklist: {
              loggedIn: check.loggedIn,
              capitalSet: check.capitalSet,
              firstStock: check.firstStock,
              firstSale: check.firstSale,
            },
            termStart: meta.termStart || new Date(createdAt).toISOString().slice(0, 10),
            termEnd: meta.termEnd || new Date(createdAt + 120 * day).toISOString().slice(0, 10),
          };
        });

      const leads = agents.flatMap((agent) =>
        (agent.leads ?? []).map((lead: any) => ({
          ...lead,
          agentId: agent.id,
          agentAccountId: agent.accountId,
          agentName: agent.name,
        })),
      );

      const tickets = (books ?? []).flatMap((book: any) => {
        const list = Array.isArray(book.data?.supportTickets) ? book.data.supportTickets : [];
        return list.map((ticket: any) => ({ ...ticket, accountId: book.user_id }));
      });

      let scopedTenants = tenants;
      let scopedAgents = agents;
      let scopedLeads = leads;
      let scopedTickets = tickets;
      if (isOperator && !isStaff) {
        scopedTenants = tenants.filter((t) => t.accountId === userId);
        scopedAgents = [];
        scopedLeads = [];
        scopedTickets = tickets.filter((t) => t.accountId === userId);
      } else if (isAgent && !isStaff) {
        scopedAgents = agents.filter((a) => a.accountId === userId);
        scopedTenants = tenants.filter((t) => t.agentId === userId);
        scopedLeads = leads.filter((l) => l.agentAccountId === userId || l.agentId === userId);
        scopedTickets = [];
      }

      return {
        ok: true as const,
        platform: {
          tenants: scopedTenants,
          agents: scopedAgents.map(({ leads: _leads, quizPassed: _quiz, ...agent }) => agent),
          leads: scopedLeads,
          commissions: Array.isArray(hub.commissions) ? hub.commissions : [],
          payouts: Array.isArray(hub.payouts) ? hub.payouts : [],
          tickets: scopedTickets,
          announcements: Array.isArray(hub.announcements) ? hub.announcements : [],
          settings: { ...defaultSettings, ...(hub.settings ?? {}) },
          auditLog: [],
        },
        me: {
          quizPassed: isAgent ? !!(bookById.get(userId)?.data?.agentAdmin?.quizPassed) : false,
          certified: isAgent ? !!(bookById.get(userId)?.data?.agentAdmin?.certified) : false,
        },
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Could not load shared records.",
        platform: null,
        me: { quizPassed: false, certified: false },
      };
    }
  });

export const savePlatformHub = createServerFn({ method: "POST" })
  .inputValidator((data: {
    accessToken: string;
    settings?: Record<string, unknown>;
    commissions?: any[];
    payouts?: any[];
    announcements?: any[];
    tenantMeta?: Record<string, any>;
  }) => data)
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin, userId } = await requireStaff(data.accessToken);
      const book = await readBook(supabaseAdmin, userId);
      const prev = (book.data.platformHub ?? {}) as PlatformHub;
      const platformHub: PlatformHub = {
        settings: data.settings ?? prev.settings ?? defaultSettings,
        commissions: data.commissions ?? prev.commissions ?? [],
        payouts: data.payouts ?? prev.payouts ?? [],
        announcements: data.announcements ?? prev.announcements ?? [],
        tenantMeta: data.tenantMeta ?? prev.tenantMeta ?? {},
        updatedAt: Date.now(),
      };
      await writeBook(supabaseAdmin, userId, { ...book.data, platformHub }, book.revision);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Could not save shared records." };
    }
  });

export const upsertTenantMeta = createServerFn({ method: "POST" })
  .inputValidator((data: { accessToken: string; accountId: string; patch: Record<string, any> }) => data)
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin, userId } = await requireStaff(data.accessToken);
      const opBook = await readBook(supabaseAdmin, data.accountId);
      const operatorMeta = { ...(opBook.data.operatorMeta ?? {}), ...data.patch };
      if (data.patch.agentId && !data.patch.agentAccountId) operatorMeta.agentAccountId = data.patch.agentId;
      if (data.patch.agentAccountId) operatorMeta.agentId = data.patch.agentAccountId;
      await writeBook(supabaseAdmin, data.accountId, { ...opBook.data, operatorMeta }, opBook.revision);

      const hubBook = await readBook(supabaseAdmin, userId);
      const prev = (hubBook.data.platformHub ?? {}) as PlatformHub;
      const tenantMeta = { ...(prev.tenantMeta ?? {}) };
      tenantMeta[data.accountId] = { ...(tenantMeta[data.accountId] ?? {}), ...operatorMeta };
      await writeBook(supabaseAdmin, userId, {
        ...hubBook.data,
        platformHub: { ...prev, tenantMeta, updatedAt: Date.now() },
      }, hubBook.revision);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Could not update the account." };
    }
  });

export const submitAgentLead = createServerFn({ method: "POST" })
  .inputValidator((data: LeadInput) => data)
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin, userId } = await authenticatedUser(data.accessToken);
      const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
      if (!(roles ?? []).some((row: any) => row.role === "agent")) {
        return { ok: false as const, error: "This login is not connected to a Field Agent account." };
      }
      const book = await readBook(supabaseAdmin, userId);
      const leads = Array.isArray(book.data.agentLeads) ? book.data.agentLeads : [];
      const payload = { ...data, agentId: userId, agentAccountId: userId, notes: [], queued: false };
      const next = leads.some((lead: any) => lead.id === data.id)
        ? leads.map((lead: any) => (lead.id === data.id ? { ...lead, ...payload } : lead))
        : [payload, ...leads];
      await writeBook(supabaseAdmin, userId, { ...book.data, agentLeads: next }, book.revision);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Could not save the lead." };
    }
  });

export const updateAgentLeadStage = createServerFn({ method: "POST" })
  .inputValidator((data: { accessToken: string; agentAccountId?: string; leadId: string; stage: LeadInput["stage"] }) => data)
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin, userId } = await authenticatedUser(data.accessToken);
      const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
      const roleList = (roles ?? []).map((r: any) => r.role);
      const staff = roleList.some((r) => ["admin", "support", "finance"].includes(r));
      const agentAccountId = staff ? (data.agentAccountId || userId) : userId;
      if (!staff && agentAccountId !== userId) return { ok: false as const, error: "You can only move your own leads." };
      if (!staff && !roleList.includes("agent")) return { ok: false as const, error: "Field Agent access is required." };
      const book = await readBook(supabaseAdmin, agentAccountId);
      const leads = Array.isArray(book.data.agentLeads) ? book.data.agentLeads : [];
      if (!leads.some((lead: any) => lead.id === data.leadId)) return { ok: false as const, error: "Lead was not found." };
      const next = leads.map((lead: any) => (lead.id === data.leadId ? { ...lead, stage: data.stage, queued: false } : lead));
      await writeBook(supabaseAdmin, agentAccountId, { ...book.data, agentLeads: next }, book.revision);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Could not update the lead." };
    }
  });

export const setAgentCertification = createServerFn({ method: "POST" })
  .inputValidator((data: { accessToken: string; agentAccountId: string; certified: boolean; territory?: string }) => data)
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await requireStaff(data.accessToken);
      const book = await readBook(supabaseAdmin, data.agentAccountId);
      const agentAdmin = {
        ...(book.data.agentAdmin ?? {}),
        certified: data.certified,
        status: data.certified ? "certified" : "pending",
        trainedAt: data.certified ? Date.now() : book.data.agentAdmin?.trainedAt ?? null,
        ...(data.territory ? { territory: data.territory } : {}),
      };
      await writeBook(supabaseAdmin, data.agentAccountId, { ...book.data, agentAdmin }, book.revision);
      return { ok: true as const, agentAdmin };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Could not save certification." };
    }
  });

export const markAgentQuizPassed = createServerFn({ method: "POST" })
  .inputValidator((data: { accessToken: string }) => data)
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin, userId } = await authenticatedUser(data.accessToken);
      const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
      if (!(roles ?? []).some((row: any) => row.role === "agent")) {
        return { ok: false as const, error: "Only Field Agents can submit training." };
      }
      const book = await readBook(supabaseAdmin, userId);
      const agentAdmin = {
        ...(book.data.agentAdmin ?? {}),
        quizPassed: true,
        quizPassedAt: Date.now(),
        certified: !!book.data.agentAdmin?.certified,
        status: book.data.agentAdmin?.certified ? "certified" : "pending",
      };
      await writeBook(supabaseAdmin, userId, { ...book.data, agentAdmin }, book.revision);
      return { ok: true as const, agentAdmin };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Could not save training." };
    }
  });

export const listAgentAdminData = createServerFn({ method: "POST" })
  .inputValidator((data: { accessToken: string }) => data)
  .handler(async ({ data }) => {
    const loaded = await loadLivePlatform({ data });
    if (!loaded.ok || !loaded.platform) return { ok: false as const, error: loaded.error ?? "Could not load agents.", agents: [] };
    return {
      ok: true as const,
      agents: loaded.platform.agents.map((agent: any) => ({
        accountId: agent.accountId,
        name: agent.name,
        phone: agent.phone,
        email: agent.email,
        admin: { certified: agent.certified, status: agent.status, trainedAt: agent.trainedAt, territory: agent.territory },
        leads: loaded.platform!.leads.filter((l: any) => l.agentId === agent.id),
        schools: loaded.platform!.tenants.filter((t: any) => t.agentId === agent.id),
      })),
    };
  });

export const listAgentLeads = createServerFn({ method: "POST" })
  .inputValidator((data: { accessToken: string }) => data)
  .handler(async ({ data }) => {
    const loaded = await loadLivePlatform({ data });
    if (!loaded.ok || !loaded.platform) return { ok: false as const, error: loaded.error ?? "Could not load leads.", leads: [] };
    return { ok: true as const, leads: loaded.platform.leads };
  });

export const assignSchoolToAgent = createServerFn({ method: "POST" })
  .inputValidator((data: {
    accessToken: string;
    operatorAccountId: string;
    agentAccountId: string | null;
    agentId?: string | null;
    canteenName?: string;
    school?: string;
    status?: string;
  }) => data)
  .handler(async ({ data }) => {
    return upsertTenantMeta({
      data: {
        accessToken: data.accessToken,
        accountId: data.operatorAccountId,
        patch: {
          agentAccountId: data.agentAccountId,
          agentId: data.agentAccountId ?? data.agentId ?? null,
          canteenName: data.canteenName,
          school: data.school,
          status: data.status,
        },
      },
    });
  });

export const submitSupportTicket = createServerFn({ method: "POST" })
  .inputValidator((data: TicketInput & { accessToken: string }) => data)
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin, userId } = await authenticatedUser(data.accessToken);
      if (data.accountId !== userId) return { ok: false as const, error: "You can only open support for your own account." };
      const book = await readBook(supabaseAdmin, userId);
      const tickets = Array.isArray(book.data.supportTickets) ? book.data.supportTickets : [];
      if (!tickets.some((ticket: any) => ticket.id === data.id)) {
        tickets.unshift({
          id: data.id,
          accountId: userId,
          accountName: data.accountName,
          subject: data.subject,
          status: "open",
          assignedTo: null,
          messages: [{ id: data.messageId, from: "operator", text: data.text, ts: data.createdAt }],
          createdAt: data.createdAt,
        });
      }
      await writeBook(supabaseAdmin, userId, { ...book.data, supportTickets: tickets }, book.revision);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Could not send the message." };
    }
  });

export const listSupportTickets = createServerFn({ method: "POST" })
  .inputValidator((data: { accessToken: string }) => data)
  .handler(async ({ data }) => {
    const loaded = await loadLivePlatform({ data });
    if (!loaded.ok || !loaded.platform) return { ok: false as const, error: loaded.error ?? "Could not load support.", tickets: [] };
    return { ok: true as const, tickets: loaded.platform.tickets };
  });

export const updateSupportTicket = createServerFn({ method: "POST" })
  .inputValidator((data: {
    accessToken: string;
    accountId: string;
    ticketId: string;
    message?: { id: string; from: "operator" | "admin"; text: string; ts: number };
    status?: "open" | "in_progress" | "resolved";
    assignedTo?: string | null;
  }) => data)
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin, userId } = await authenticatedUser(data.accessToken);
      const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
      const staff = (roles ?? []).some((row: any) => ["admin", "support", "finance"].includes(row.role));
      if (!staff && data.accountId !== userId) return { ok: false as const, error: "You cannot update this conversation." };
      const book = await readBook(supabaseAdmin, data.accountId);
      const tickets = Array.isArray(book.data.supportTickets) ? book.data.supportTickets : [];
      const next = tickets.map((ticket: any) => {
        if (ticket.id !== data.ticketId) return ticket;
        const messages = [...(ticket.messages ?? [])];
        if (data.message && !messages.some((message: any) => message.id === data.message!.id)) messages.push(data.message);
        return {
          ...ticket,
          messages,
          status: data.status ?? (data.message?.from === "admin" ? "in_progress" : ticket.status === "resolved" ? "open" : ticket.status),
          assignedTo: data.assignedTo !== undefined ? data.assignedTo : ticket.assignedTo,
        };
      });
      await writeBook(supabaseAdmin, data.accountId, { ...book.data, supportTickets: next }, book.revision);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Could not update support." };
    }
  });
