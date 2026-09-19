import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Card, Field, SectionTitle, SelectField } from "@/components/ui-kit";
import { Pill } from "@/components/AdminShell";
import { useAuth } from "@/lib/auth";
import { fmtDate, type Ticket } from "@/lib/platform";
import { listSupportTickets, updateSupportTicket } from "@/lib/platform.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/support")({
  head: () => ({
    meta: [
      { title: "Support Tickets — SmartCanteen Admin" },
      {
        name: "description",
        content: "A recorded ticket queue for operator issues: subject, thread, assignment and resolution status.",
      },
      { property: "og:title", content: "Support Tickets — SmartCanteen Admin" },
      { property: "og:description", content: "Support with a paper trail, not scattered WhatsApp messages." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Support,
});

const tone = (s: Ticket["status"]) => (s === "resolved" ? "good" : s === "open" ? "warn" : "info");

function Support() {
  const { user, accounts } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | Ticket["status"]>("all");
  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) return;
      const result = await listSupportTickets({ data: { accessToken } });
      if (!active) return;
      if (result.ok) { setTickets(result.tickets as Ticket[]); setLoadError(""); }
      else setLoadError(result.error);
    };
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const saveTicket = async (ticket: Ticket, change: { message?: { id: string; from: "admin"; text: string; ts: number }; status?: Ticket["status"]; assignedTo?: string | null }) => {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) return setLoadError("Admin login expired. Log in again.");
    const result = await updateSupportTicket({ data: { accessToken, accountId: ticket.accountId, ticketId: ticket.id, ...change } });
    if (!result.ok) setLoadError(result.error);
    else setTickets((items) => items.map((item) => item.id !== ticket.id ? item : { ...item, status: change.status ?? (change.message ? "in_progress" : item.status), assignedTo: change.assignedTo !== undefined ? change.assignedTo : item.assignedTo, messages: change.message ? [...item.messages, change.message] : item.messages }));
  };

  const staff = accounts.filter((account) => ["admin", "support"].includes(account.role) && account.active);
  const visible = tickets.filter((ticket) => {
    if (status !== "all" && ticket.status !== status) return false;
    const haystack = `${ticket.subject} ${ticket.accountName} ${ticket.assignedTo ?? ""}`.toLowerCase();
    return !query || haystack.includes(query.toLowerCase());
  });
  const counts = {
    open: tickets.filter((ticket) => ticket.status === "open").length,
    inProgress: tickets.filter((ticket) => ticket.status === "in_progress").length,
    resolved: tickets.filter((ticket) => ticket.status === "resolved").length,
  };

  return (
    <>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-primary">Customer care</p>
        <h1 className="text-2xl font-extrabold text-on-surface sm:text-3xl">Support conversations</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Assign, reply to and close operator issues with a complete record.</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3"><p className="text-xs font-bold text-on-surface-variant">New</p><p className="text-2xl font-extrabold text-secondary">{counts.open}</p></Card>
        <Card className="p-3"><p className="text-xs font-bold text-on-surface-variant">In progress</p><p className="text-2xl font-extrabold text-primary">{counts.inProgress}</p></Card>
        <Card className="p-3"><p className="text-xs font-bold text-on-surface-variant">Resolved</p><p className="text-2xl font-extrabold text-on-surface">{counts.resolved}</p></Card>
      </div>

      <Card className="grid gap-3 p-3 sm:grid-cols-[1fr_190px] sm:items-end">
        <Field label="Find a conversation" placeholder="Subject, account or staff member" value={query} onChange={(event) => setQuery(event.target.value)} />
        <SelectField label="Status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
          <option value="all">All statuses</option>
          <option value="open">New</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
        </SelectField>
      </Card>

      {loadError ? <Card className="border-tertiary/30 text-sm font-bold text-tertiary">{loadError}</Card> : null}
      <SectionTitle>{visible.length} conversation{visible.length === 1 ? "" : "s"}</SectionTitle>
      {tickets.length === 0 ? <Card>No support messages have been submitted.</Card> : null}
      {tickets.length > 0 && visible.length === 0 ? <Card>No conversations match these filters.</Card> : null}
      {visible.map((t) => (
        <Card key={t.id} className="space-y-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-bold text-on-surface">{t.subject}</p>
              <p className="text-xs text-on-surface-variant">
                {t.accountName} · opened {fmtDate(t.createdAt)}
                {t.assignedTo ? ` · assigned to ${t.assignedTo}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Pill tone={tone(t.status)}>{t.status === "open" ? "new" : t.status.replace("_", " ")}</Pill>
              <select
                aria-label={`Assign ${t.subject}`}
                value={t.assignedTo ?? ""}
                onChange={(event) => void saveTicket(t, { status: t.status === "open" ? "in_progress" : t.status, assignedTo: event.target.value || null })}
                className="h-10 rounded-md border-2 border-outline-variant bg-surface-lowest px-2 text-xs font-semibold text-on-surface"
              >
                <option value="">Unassigned</option>
                {staff.map((member) => <option key={member.id} value={member.name}>{member.name}</option>)}
              </select>
              {t.status !== "resolved" ? (
                <button
                  onClick={() => void saveTicket(t, { status: "resolved", assignedTo: user?.name ?? "admin" })}
                  className="text-xs font-bold text-primary underline"
                >
                  Mark resolved
                </button>
              ) : (
                <button onClick={() => void saveTicket(t, { status: "open" })} className="text-xs font-bold text-primary underline">
                  Reopen
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1">
            {t.messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[85%] rounded-md p-2 text-sm ${
                  m.from === "admin"
                    ? "ml-auto bg-primary text-on-primary"
                    : "bg-surface-lowest text-on-surface"
                }`}
              >
                {m.text}
                <span className="mt-0.5 block text-[10px] opacity-70">{fmtDate(m.ts)}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              aria-label={`Reply to ${t.subject}`}
              value={draft[t.id] ?? ""}
              onChange={(e) => setDraft({ ...draft, [t.id]: e.target.value })}
              placeholder="Write a reply…"
              className="h-12 flex-1 rounded-md border-2 border-outline-variant bg-surface-lowest px-3 text-sm"
            />
            <button
              onClick={() => {
                const text = (draft[t.id] ?? "").trim();
                if (!text) return;
                const message = { id: crypto.randomUUID(), from: "admin" as const, text, ts: Date.now() };
                void saveTicket(t, { message, status: "in_progress", assignedTo: user?.name ?? "admin" });
                setDraft({ ...draft, [t.id]: "" });
              }}
              className="flex h-12 w-12 items-center justify-center rounded-md bg-primary text-on-primary"
              aria-label="Send reply"
            >
              <Icon name="send" />
            </button>
          </div>
        </Card>
      ))}
    </>
  );
}
