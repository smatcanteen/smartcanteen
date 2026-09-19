import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Icon } from "@/components/Icon";
import { Card, Field, PrimaryButton, SectionTitle } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import { fmtDate, type Ticket } from "@/lib/platform";
import { listSupportTickets, submitSupportTicket, updateSupportTicket } from "@/lib/platform.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Help & Feedback — SmartCanteen" },
      {
        name: "description",
        content: "Message the SmartCanteen support team straight from your cash book and follow the reply thread.",
      },
      { property: "og:title", content: "Help & Feedback — SmartCanteen" },
      { property: "og:description", content: "Stuck? Send a message and get a recorded answer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [reply, setReply] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) return;
      const result = await listSupportTickets({ data: { accessToken } });
      if (!active) return;
      if (result.ok) { setTickets(result.tickets as Ticket[]); setMessage(""); }
      else setMessage(result.error);
    };
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const mine = tickets.filter((ticket) => ticket.accountId === user?.id);

  return (
    <AppLayout title="Help & feedback" back>
      <Card className="space-y-sm">
        <SectionTitle>Send a message to support</SectionTitle>
        <Field label="Subject" placeholder="What is happening?" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <label className="block text-sm font-bold text-on-surface-variant">
          Message
          <textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="mt-1 w-full rounded-md border-2 border-outline-variant bg-surface-lowest p-3 text-sm font-normal text-on-surface"
          />
        </label>
        <PrimaryButton
          disabled={sending}
          onClick={async () => {
            if (!subject.trim() || !text.trim() || !user || sending) return;
            setSending(true);
            setMessage("");
            const { data } = await supabase.auth.getSession();
            const accessToken = data.session?.access_token;
            if (!accessToken) { setMessage("Your login expired. Log in again."); setSending(false); return; }
            const id = crypto.randomUUID();
            const messageId = crypto.randomUUID();
            const createdAt = Date.now();
            const result = await submitSupportTicket({ data: { accessToken, id, accountId: user.id, accountName: user.name, subject: subject.trim(), text: text.trim(), createdAt, messageId } });
            if (result.ok) {
              setTickets((items) => [{ id, accountId: user.id, accountName: user.name, subject: subject.trim(), status: "open", assignedTo: null, messages: [{ id: messageId, from: "operator", text: text.trim(), ts: createdAt }], createdAt }, ...items]);
              setSubject("");
              setText("");
              setMessage("Message sent to Admin.");
            } else setMessage(result.error);
            setSending(false);
          }}
        >
          <Icon name="send" /> {sending ? "Sending…" : "Send to admin"}
        </PrimaryButton>
        {message ? <p className="text-sm font-semibold text-primary">{message}</p> : null}
      </Card>

      <SectionTitle>Your conversations</SectionTitle>
      {mine.length === 0 ? <Card>No messages yet.</Card> : null}
      {mine.map((t) => (
        <Card key={t.id} className="space-y-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-bold text-on-surface">{t.subject}</p>
            <span className="text-xs font-semibold text-on-surface-variant">{t.status.replace("_", " ")}</span>
          </div>
          {t.messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] rounded-md p-2 text-sm ${
                m.from === "operator" ? "ml-auto bg-primary text-on-primary" : "bg-surface-lowest text-on-surface"
              }`}
            >
              {m.text}
              <span className="mt-0.5 block text-[10px] opacity-70">{fmtDate(m.ts)}</span>
            </div>
          ))}
          {t.status !== "resolved" ? (
            <div className="flex gap-2">
              <input
                aria-label="Reply"
                value={reply[t.id] ?? ""}
                onChange={(e) => setReply({ ...reply, [t.id]: e.target.value })}
                placeholder="Add to this conversation…"
                className="h-12 flex-1 rounded-md border-2 border-outline-variant bg-surface-lowest px-3 text-sm"
              />
              <button
                onClick={async () => {
                  const v = (reply[t.id] ?? "").trim();
                  if (!v || !user) return;
                  const { data } = await supabase.auth.getSession();
                  const accessToken = data.session?.access_token;
                  if (!accessToken) return setMessage("Your login expired. Log in again.");
                  const nextMessage = { id: crypto.randomUUID(), from: "operator" as const, text: v, ts: Date.now() };
                  const result = await updateSupportTicket({ data: { accessToken, accountId: user.id, ticketId: t.id, message: nextMessage } });
                  if (result.ok) {
                    setTickets((items) => items.map((item) => item.id === t.id ? { ...item, status: item.status === "resolved" ? "open" : item.status, messages: [...item.messages, nextMessage] } : item));
                    setReply({ ...reply, [t.id]: "" });
                  } else setMessage(result.error);
                }}
                aria-label="Send message"
                className="flex h-12 w-12 items-center justify-center rounded-md bg-primary text-on-primary"
              >
                <Icon name="send" />
              </button>
            </div>
          ) : null}
        </Card>
      ))}
    </AppLayout>
  );
}
