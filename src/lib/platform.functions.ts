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

export const submitAgentLead = createServerFn({ method: "POST" })
  .inputValidator((data: LeadInput) => data)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(data.accessToken);
    const userId = authData.user?.id;
    if (authError || !userId) return { ok: false as const, error: "Your login expired. Log in again and retry." };
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((row: any) => row.role === "agent")) {
      return { ok: false as const, error: "This login is not connected to a Field Agent account." };
    }
    const { data: book, error: bookError } = await supabaseAdmin.from("canteen_books").select("data, revision").eq("user_id", userId).maybeSingle();
    if (bookError) return { ok: false as const, error: bookError.message };
    const current = (book?.data ?? {}) as any;
    const leads = Array.isArray(current.agentLeads) ? current.agentLeads : [];
    if (!leads.some((lead: any) => lead.id === data.id)) {
      leads.unshift({ ...data, agentAccountId: userId, notes: [], queued: false });
    }
    const nextData = { ...current, agentLeads: leads };
    const { error } = await supabaseAdmin.from("canteen_books").upsert({
      user_id: userId,
      data: nextData,
      revision: (book?.revision ?? 0) + 1,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    return error ? { ok: false as const, error: error.message } : { ok: true as const };
  });

export const listAgentLeads = createServerFn({ method: "POST" })
  .inputValidator((data: { accessToken: string }) => data)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(data.accessToken);
    const userId = authData.user?.id;
    if (authError || !userId) return { ok: false as const, error: "Your Admin login expired.", leads: [] };
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((row: any) => ["admin", "support"].includes(row.role))) {
      return { ok: false as const, error: "This login cannot view Agent leads.", leads: [] };
    }
    const { data: agentRoles } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "agent");
    const agentIds = (agentRoles ?? []).map((row: any) => row.user_id);
    if (!agentIds.length) return { ok: true as const, leads: [] };
    const [{ data: books, error }, { data: profiles }] = await Promise.all([
      supabaseAdmin.from("canteen_books").select("user_id, data").in("user_id", agentIds),
      supabaseAdmin.from("profiles").select("id, full_name").in("id", agentIds),
    ]);
    if (error) return { ok: false as const, error: error.message, leads: [] };
    const names = new Map((profiles ?? []).map((profile: any) => [profile.id, profile.full_name]));
    const leads = (books ?? []).flatMap((book: any) => {
      const saved = Array.isArray(book.data?.agentLeads) ? book.data.agentLeads : [];
      return saved.map((lead: any) => ({ ...lead, agentAccountId: book.user_id, agentName: names.get(book.user_id) ?? "Field agent" }));
    });
    return { ok: true as const, leads };
  });

async function authenticatedUser(accessToken: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("Your login expired. Log in again.");
  return { supabaseAdmin, userId: data.user.id };
}

async function requireStaff(accessToken: string) {
  const auth = await authenticatedUser(accessToken);
  const { data: roles } = await auth.supabaseAdmin.from("user_roles").select("role").eq("user_id", auth.userId);
  if (!(roles ?? []).some((row: any) => ["admin", "support"].includes(row.role))) throw new Error("Admin access is required.");
  return auth;
}

export const updateAgentLeadStage = createServerFn({ method: "POST" })
  .inputValidator((data: { accessToken: string; agentAccountId: string; leadId: string; stage: LeadInput["stage"] }) => data)
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await requireStaff(data.accessToken);
      const { data: book, error } = await supabaseAdmin.from("canteen_books").select("data, revision").eq("user_id", data.agentAccountId).maybeSingle();
      if (error || !book) return { ok: false as const, error: error?.message ?? "Agent records were not found." };
      const current = (book.data ?? {}) as any;
      const leads = Array.isArray(current.agentLeads) ? current.agentLeads : [];
      const found = leads.some((lead: any) => lead.id === data.leadId);
      if (!found) return { ok: false as const, error: "Lead was not found." };
      const next = leads.map((lead: any) => lead.id === data.leadId ? { ...lead, stage: data.stage } : lead);
      const { error: saveError } = await supabaseAdmin.from("canteen_books").update({ data: { ...current, agentLeads: next }, revision: book.revision + 1, updated_at: new Date().toISOString() }).eq("user_id", data.agentAccountId);
      return saveError ? { ok: false as const, error: saveError.message } : { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Could not update the lead." };
    }
  });

export const setAgentCertification = createServerFn({ method: "POST" })
  .inputValidator((data: { accessToken: string; agentAccountId: string; certified: boolean }) => data)
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await requireStaff(data.accessToken);
      const { data: book, error } = await supabaseAdmin.from("canteen_books").select("data, revision").eq("user_id", data.agentAccountId).maybeSingle();
      if (error) return { ok: false as const, error: error.message };
      const current = (book?.data ?? {}) as any;
      const agentAdmin = { ...(current.agentAdmin ?? {}), certified: data.certified, status: data.certified ? "certified" : "pending", trainedAt: data.certified ? Date.now() : null };
      const { error: saveError } = await supabaseAdmin.from("canteen_books").upsert({ user_id: data.agentAccountId, data: { ...current, agentAdmin }, revision: (book?.revision ?? 0) + 1, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      return saveError ? { ok: false as const, error: saveError.message } : { ok: true as const, agentAdmin };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Could not save certification." };
    }
  });

export const listAgentAdminData = createServerFn({ method: "POST" })
  .inputValidator((data: { accessToken: string }) => data)
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await requireStaff(data.accessToken);
      const { data: agentRoles } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "agent");
      const ids = (agentRoles ?? []).map((row: any) => row.user_id);
      if (!ids.length) return { ok: true as const, agents: [] };
      const { data: books, error } = await supabaseAdmin.from("canteen_books").select("user_id, data").in("user_id", ids);
      if (error) return { ok: false as const, error: error.message, agents: [] };
      return { ok: true as const, agents: (books ?? []).map((book: any) => ({ accountId: book.user_id, admin: book.data?.agentAdmin ?? null, leads: book.data?.agentLeads ?? [] })) };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Could not load Agent records.", agents: [] };
    }
  });

export const submitSupportTicket = createServerFn({ method: "POST" })
  .inputValidator((data: TicketInput & { accessToken: string }) => data)
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin, userId } = await authenticatedUser(data.accessToken);
      if (data.accountId !== userId) return { ok: false as const, error: "You can only open support for your own account." };
      const { data: book } = await supabaseAdmin.from("canteen_books").select("data, revision").eq("user_id", userId).maybeSingle();
      const current = (book?.data ?? {}) as any;
      const tickets = Array.isArray(current.supportTickets) ? current.supportTickets : [];
      if (!tickets.some((ticket: any) => ticket.id === data.id)) tickets.unshift({ id: data.id, accountId: userId, accountName: data.accountName, subject: data.subject, status: "open", assignedTo: null, messages: [{ id: data.messageId, from: "operator", text: data.text, ts: data.createdAt }], createdAt: data.createdAt });
      const { error } = await supabaseAdmin.from("canteen_books").upsert({ user_id: userId, data: { ...current, supportTickets: tickets }, revision: (book?.revision ?? 0) + 1, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      return error ? { ok: false as const, error: error.message } : { ok: true as const };
    } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : "Could not send the message." }; }
  });

export const listSupportTickets = createServerFn({ method: "POST" })
  .inputValidator((data: { accessToken: string }) => data)
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin, userId } = await authenticatedUser(data.accessToken);
      const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
      const staff = (roles ?? []).some((row: any) => ["admin", "support"].includes(row.role));
      const query = supabaseAdmin.from("canteen_books").select("user_id, data");
      const { data: books, error } = staff ? await query : await query.eq("user_id", userId);
      if (error) return { ok: false as const, error: error.message, tickets: [] };
      const tickets = (books ?? []).flatMap((book: any) => (Array.isArray(book.data?.supportTickets) ? book.data.supportTickets : []).map((ticket: any) => ({ ...ticket, accountId: book.user_id })));
      return { ok: true as const, tickets };
    } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : "Could not load support messages.", tickets: [] }; }
  });

export const updateSupportTicket = createServerFn({ method: "POST" })
  .inputValidator((data: { accessToken: string; accountId: string; ticketId: string; message?: { id: string; from: "operator" | "admin"; text: string; ts: number }; status?: "open" | "in_progress" | "resolved"; assignedTo?: string | null }) => data)
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin, userId } = await authenticatedUser(data.accessToken);
      const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
      const staff = (roles ?? []).some((row: any) => ["admin", "support"].includes(row.role));
      if (!staff && data.accountId !== userId) return { ok: false as const, error: "You cannot update this conversation." };
      const { data: book, error } = await supabaseAdmin.from("canteen_books").select("data, revision").eq("user_id", data.accountId).maybeSingle();
      if (error || !book) return { ok: false as const, error: error?.message ?? "Conversation was not found." };
      const current = (book.data ?? {}) as any;
      const tickets = Array.isArray(current.supportTickets) ? current.supportTickets : [];
      const next = tickets.map((ticket: any) => {
        if (ticket.id !== data.ticketId) return ticket;
        const messages = [...(ticket.messages ?? [])];
        if (data.message && !messages.some((message: any) => message.id === data.message!.id)) messages.push(data.message);
        return { ...ticket, messages, status: data.status ?? (data.message?.from === "admin" ? "in_progress" : ticket.status === "resolved" ? "open" : ticket.status), assignedTo: data.assignedTo !== undefined ? data.assignedTo : ticket.assignedTo };
      });
      const { error: saveError } = await supabaseAdmin.from("canteen_books").update({ data: { ...current, supportTickets: next }, revision: book.revision + 1, updated_at: new Date().toISOString() }).eq("user_id", data.accountId);
      return saveError ? { ok: false as const, error: saveError.message } : { ok: true as const };
    } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : "Could not update support." }; }
  });

