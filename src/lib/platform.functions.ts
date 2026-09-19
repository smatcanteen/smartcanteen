import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
