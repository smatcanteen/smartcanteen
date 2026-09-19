import { createFileRoute } from "@tanstack/react-router";
import { Card, SectionTitle } from "@/components/ui-kit";
import { Pill } from "@/components/AdminShell";
import { fmtDate, stageLabels, usePlatform, type LeadStage } from "@/lib/platform";

export const Route = createFileRoute("/admin/leads")({
  head: () => ({
    meta: [
      { title: "Lead Pipeline — SmartCanteen Admin" },
      {
        name: "description",
        content: "Every school in the pipeline: contacted, demo given, trial started, subscribed or lost — by agent.",
      },
      { property: "og:title", content: "Lead Pipeline — SmartCanteen Admin" },
      { property: "og:description", content: "Track school visits through to subscription." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Leads,
});

const stages: LeadStage[] = ["contacted", "demo", "trial", "subscribed", "lost"];

function Leads() {
  const { s, setLeadStage } = usePlatform();
  const agentName = (id: string) => s.agents.find((a) => a.id === id)?.name ?? "Unassigned";

  return (
    <>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-primary">Field activity</p>
        <h1 className="text-2xl font-extrabold text-on-surface sm:text-3xl">Lead pipeline</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Only leads submitted by real field-agent accounts appear here.</p>
      </div>
      {s.leads.length === 0 ? (
        <Card className="py-8 text-center">
          <p className="font-bold text-on-surface">No leads submitted yet.</p>
          <p className="mt-1 text-sm text-on-surface-variant">A lead will appear after an agent records a school visit.</p>
        </Card>
      ) : (
      <div className="grid gap-md md:grid-cols-3 xl:grid-cols-5">
      {stages.map((stage) => {
        const items = s.leads.filter((l) => l.stage === stage);
        return (
          <div key={stage} className="space-y-sm">
            <SectionTitle>
              {stageLabels[stage]} ({items.length})
            </SectionTitle>
            {items.map((l) => (
              <Card key={l.id} className="space-y-1">
                <p className="font-bold text-on-surface">{l.school}</p>
                <p className="text-xs text-on-surface-variant">
                  {l.contactName} · {l.phone}
                </p>
                <div className="flex flex-wrap gap-1">
                  <Pill tone="info">{agentName(l.agentId)}</Pill>
                  <Pill tone="info">{fmtDate(l.createdAt)}</Pill>
                  {l.queued ? <Pill tone="warn">Queued offline</Pill> : null}
                </div>
                {l.notes.slice(0, 2).map((n) => (
                  <p key={n.id} className="text-xs text-on-surface-variant">
                    • {n.text}
                  </p>
                ))}
                <select
                  aria-label={`Move ${l.school}`}
                  value={l.stage}
                  onChange={(e) => setLeadStage(l.id, e.target.value as LeadStage)}
                  className="mt-1 h-11 w-full rounded-md border-2 border-outline-variant bg-surface-lowest px-2 text-sm font-semibold text-on-surface"
                >
                  {stages.map((x) => (
                    <option key={x} value={x}>
                      {stageLabels[x]}
                    </option>
                  ))}
                </select>
              </Card>
            ))}
            {items.length === 0 ? <p className="text-xs text-outline">Empty.</p> : null}
          </div>
        );
      })}
      </div>
      )}
    </>
  );
}
