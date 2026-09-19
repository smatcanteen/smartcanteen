import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, Field, PrimaryButton, SectionTitle, SelectField } from "@/components/ui-kit";
import { fmtDate, usePlatform, type AnnouncementAudience } from "@/lib/platform";

export const Route = createFileRoute("/admin/announcements")({
  head: () => ({
    meta: [
      { title: "Broadcasts — SmartCanteen Admin" },
      {
        name: "description",
        content: "Send a banner to every operator, or to one zone, one category template or one agent's accounts.",
      },
      { property: "og:title", content: "Broadcasts — SmartCanteen Admin" },
      { property: "og:description", content: "Segmented announcements for the canteen portfolio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Announcements,
});

function Announcements() {
  const { s, addAnnouncement, toggleAnnouncement } = usePlatform();
  const [f, setF] = useState<{ title: string; body: string; audience: AnnouncementAudience; recipientIds: string[] }>({
    title: "", body: "", audience: "operators", recipientIds: [],
  });

  const recipients = [
    ...(f.audience !== "agents"
      ? s.tenants.map((operator) => ({
          id: `operator:${operator.accountId}`,
          name: operator.canteenName,
          detail: `${operator.ownerName} · Canteen operator`,
        }))
      : []),
    ...(f.audience !== "operators"
      ? s.agents.map((agent) => ({
          id: `agent:${agent.id}`,
          name: agent.name,
          detail: `${agent.territory} · Field agent`,
        }))
      : []),
  ];
  const validRecipientIds = new Set(recipients.map((recipient) => recipient.id));
  const selectedIds = f.recipientIds.length
    ? f.recipientIds.filter((id) => validRecipientIds.has(id))
    : recipients.map((recipient) => recipient.id);
  const allSelected = recipients.length > 0 && selectedIds.length === recipients.length;

  const changeAudience = (audience: AnnouncementAudience) => setF({ ...f, audience, recipientIds: [] });
  const toggleRecipient = (id: string) => {
    const current = selectedIds;
    setF({ ...f, recipientIds: current.includes(id) ? current.filter((item) => item !== id) : [...current, id] });
  };

  const publish = () => {
    if (!f.title.trim() || !f.body.trim()) return;
    addAnnouncement({
      title: f.title.trim(),
      body: f.body.trim(),
      audience: f.audience,
      segment: {
        recipientIds: selectedIds,
      },
    });
    setF({ title: "", body: "", audience: "operators", recipientIds: [] });
  };

  return (
    <>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-primary">Communication</p>
        <h1 className="text-2xl font-extrabold text-on-surface sm:text-3xl">Announcements</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Publish a banner to operators, agents, or both.</p>
      </div>
      <div className="grid gap-md md:grid-cols-2">
      <Card className="space-y-sm">
        <SectionTitle>New announcement</SectionTitle>
        <p className="text-xs text-on-surface-variant">
          Publish one clear banner to canteen operators, field agents, or both groups.
        </p>
        <SelectField label="Who should see it?" value={f.audience} onChange={(e) => changeAudience(e.target.value as AnnouncementAudience)}>
          <option value="operators">Canteen operators</option>
          <option value="agents">Field agents</option>
          <option value="both">Operators and agents</option>
        </SelectField>
        <Field label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <label className="block text-sm font-bold text-on-surface-variant">
          Message
          <textarea
            rows={4}
            value={f.body}
            onChange={(e) => setF({ ...f, body: e.target.value })}
            className="mt-1 w-full rounded-md border-2 border-outline-variant bg-surface-lowest p-3 text-sm font-normal text-on-surface"
          />
        </label>
        <div className="space-y-2 rounded-md border border-outline-variant bg-surface-lowest p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-on-surface">
                Recipients · {selectedIds.length} of {recipients.length}
              </p>
              <p className="text-xs text-on-surface-variant">
                {f.audience === "agents" ? "Field agents" : f.audience === "operators" ? "Canteen operators" : "Operators and field agents"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setF({ ...f, recipientIds: allSelected ? ["__none__"] : [] })}
              className="text-xs font-bold text-primary underline"
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
          </div>
          {recipients.length === 0 ? (
            <p className="rounded-md bg-secondary/10 p-3 text-sm font-bold text-secondary">No matching accounts are available.</p>
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
              {recipients.map((recipient) => (
                <label key={recipient.id} className="flex cursor-pointer items-center gap-3 rounded-md border border-outline-variant bg-surface p-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(recipient.id)}
                    onChange={() => toggleRecipient(recipient.id)}
                    className="h-5 w-5 accent-primary"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-on-surface">{recipient.name}</span>
                    <span className="block truncate text-xs text-on-surface-variant">{recipient.detail}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
        <PrimaryButton onClick={publish} disabled={!recipients.length || selectedIds.length === 0}>Publish to {selectedIds.length} recipient{selectedIds.length === 1 ? "" : "s"}</PrimaryButton>
      </Card>

      <div className="space-y-sm">
        {s.announcements.map((a) => (
          <Card key={a.id} className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-bold text-on-surface">{a.title}</p>
              <p className="text-sm text-on-surface-variant">{a.body}</p>
              <p className="mt-1 text-xs font-bold text-primary">
                Audience: {a.audience === "agents" ? "Field agents" : a.audience === "both" ? "Operators and agents" : "Canteen operators"}
              </p>
              <p className="mt-1 text-xs text-outline">
                Posted {fmtDate(a.ts)}
                {a.segment.recipientIds?.length ? ` · ${a.segment.recipientIds.length} recipients` : " · All matching accounts"}
              </p>
            </div>
            <button
              role="switch"
              aria-checked={a.active}
              aria-label={`Toggle ${a.title}`}
              onClick={() => toggleAnnouncement(a.id)}
              className={`h-7 w-12 shrink-0 rounded-full p-1 transition-colors ${a.active ? "bg-primary" : "bg-outline-variant"}`}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-surface-lowest transition-transform ${a.active ? "translate-x-5" : ""}`}
              />
            </button>
          </Card>
        ))}
      </div>
      </div>
    </>
  );
}
