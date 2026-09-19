import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

async function readSharedState() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("platform_state").select("data").eq("id", "shared").single();
  if (error) throw new Error(error.message);
  return { supabaseAdmin, state: (data?.data ?? {}) as any };
}

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

export const submitSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: TicketInput) => data)
  .handler(async ({ data, context }) => {
    if (data.accountId !== context.userId) return { ok: false as const, error: "You can only open support for your own account." };
    const { supabaseAdmin, state } = await readSharedState();
    const tickets = Array.isArray(state.tickets) ? state.tickets : [];
    if (!tickets.some((ticket: any) => ticket.id === data.id)) {
      tickets.unshift({
        id: data.id,
        accountId: context.userId,
        accountName: data.accountName,
        subject: data.subject,
        status: "open",
        assignedTo: null,
        messages: [{ id: data.messageId, from: "operator", text: data.text, ts: data.createdAt }],
        createdAt: data.createdAt,
      });
    }
    const { error } = await supabaseAdmin.from("platform_state").update({ data: { ...state, tickets }, updated_at: new Date().toISOString() }).eq("id", "shared");
    return error ? { ok: false as const, error: error.message } : { ok: true as const };
  });

export const submitSupportReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ticketId: string; messageId: string; text: string; ts: number }) => data)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, state } = await readSharedState();
    const tickets = Array.isArray(state.tickets) ? state.tickets : [];
    const ticket = tickets.find((item: any) => item.id === data.ticketId);
    if (!ticket || ticket.accountId !== context.userId) return { ok: false as const, error: "Conversation not found." };
    if (!ticket.messages.some((message: any) => message.id === data.messageId)) {
      ticket.messages.push({ id: data.messageId, from: "operator", text: data.text, ts: data.ts });
      if (ticket.status === "resolved") ticket.status = "open";
    }
    const { error } = await supabaseAdmin.from("platform_state").update({ data: { ...state, tickets }, updated_at: new Date().toISOString() }).eq("id", "shared");
    return error ? { ok: false as const, error: error.message } : { ok: true as const };
  });
