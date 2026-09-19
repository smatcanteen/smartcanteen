import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, Field, PrimaryButton, SectionTitle, SelectField } from "@/components/ui-kit";
import { categoryLabels, fmtDate, usePlatform, zones, type AnnouncementAudience, type CategoryTemplate } from "@/lib/platform";

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
  const [f, setF] = useState<{ title: string; body: string; audience: AnnouncementAudience; zone: string; category: string; agentId: string }>({
    title: "", body: "", audience: "operators", zone: "", category: "", agentId: "",
  });

  const publish = () => {
    if (!f.title.trim() || !f.body.trim()) return;
    addAnnouncement({
      title: f.title.trim(),
      body: f.body.trim(),
      audience: f.audience,
      segment: {
        ...(f.zone ? { zone: f.zone } : {}),
        ...(f.category ? { category: f.category as CategoryTemplate } : {}),
        ...(f.agentId ? { agentId: f.agentId } : {}),
      },
    });
    setF({ title: "", body: "", audience: "operators", zone: "", category: "", agentId: "" });
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
        <SelectField label="Who should see it?" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value as AnnouncementAudience })}>
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
        <div className="grid gap-sm sm:grid-cols-3">
          <SelectField label="Operator zone" value={f.zone} disabled={f.audience === "agents"} onChange={(e) => setF({ ...f, zone: e.target.value })}>
            <option value="">All zones</option>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </SelectField>
          <SelectField label="Canteen type" value={f.category} disabled={f.audience === "agents"} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option value="">All categories</option>
            {(Object.keys(categoryLabels) as CategoryTemplate[]).map((c) => (
              <option key={c} value={c}>
                {categoryLabels[c]}
              </option>
            ))}
          </SelectField>
          <SelectField label={f.audience === "agents" ? "Field agent" : "Assigned agent"} value={f.agentId} onChange={(e) => setF({ ...f, agentId: e.target.value })}>
            <option value="">All agents</option>
            {s.agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>
        </div>
        <PrimaryButton onClick={publish}>Publish</PrimaryButton>
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
                {a.segment.zone ? ` · ${a.segment.zone}` : ""}
                {a.segment.category ? ` · ${categoryLabels[a.segment.category]}` : ""}
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
