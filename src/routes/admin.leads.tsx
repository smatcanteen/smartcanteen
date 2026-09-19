import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, SectionTitle } from "@/components/ui-kit";
import { Pill } from "@/components/AdminShell";
import { fmtDate, stageLabels, usePlatform, type Lead, type LeadStage } from "@/lib/platform";
import { listAgentLeads, updateAgentLeadStage } from "@/lib/platform.functions";
import { supabase } from "@/integrations/supabase/client";

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

type SharedLead = Lead & { agentName?: string; agentAccountId?: string };

function Leads() {
  const { s, setLeadStage } = usePlatform();
  const [sharedLeads, setSharedLeads] = useState<SharedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        if (active) { setLoadError("Admin login expired. Log in again."); setLoading(false); }
        return;
      }
      try {
        const result = await listAgentLeads({ data: { accessToken } });
        if (!active) return;
        if (result.ok) { setSharedLeads(result.leads as SharedLead[]); setLoadError(""); }
        else setLoadError(result.error);
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : "Could not load Field Agent leads.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const leads = useMemo(() => {
    const byId = new Map<string, SharedLead>();
    [...s.leads, ...sharedLeads].forEach((lead) => byId.set(lead.id, lead));
    return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
  }, [s.leads, sharedLeads]);
  const agentName = (lead: SharedLead) => lead.agentName ?? s.agents.find((a) => a.id === lead.agentId)?.name ?? "Field agent";

  return (
    <>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-primary">Field activity</p>
        <h1 className="text-2xl font-extrabold text-on-surface sm:text-3xl">Lead pipeline</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Only leads submitted by real field-agent accounts appear here.</p>
      </div>
      {loadError ? <Card className="border-tertiary/30 bg-tertiary/5 text-sm font-bold text-tertiary">{loadError}</Card> : null}
      {loading ? <Card className="py-8 text-center"><p className="font-bold text-on-surface">Loading Field Agent leads…</p></Card> : null}
      {!loading && leads.length === 0 ? (
        <Card className="py-8 text-center">
          <p className="font-bold text-on-surface">No leads submitted yet.</p>
          <p className="mt-1 text-sm text-on-surface-variant">A lead will appear after an agent records a school visit.</p>
        </Card>
      ) : !loading ? (
      <div className="grid gap-md md:grid-cols-3 xl:grid-cols-5">
      {stages.map((stage) => {
        const items = leads.filter((l) => l.stage === stage);
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
                  <Pill tone="info">{agentName(l)}</Pill>
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
                  disabled={savingId === l.id}
                  onChange={async (e) => {
                    const stage = e.target.value as LeadStage;
                    if (!l.agentAccountId) { setLeadStage(l.id, stage); return; }
                    setSavingId(l.id);
                    setLoadError("");
                    const { data } = await supabase.auth.getSession();
                    const accessToken = data.session?.access_token;
                    if (!accessToken) { setLoadError("Admin login expired. Log in again."); setSavingId(null); return; }
                    const result = await updateAgentLeadStage({ data: { accessToken, agentAccountId: l.agentAccountId, leadId: l.id, stage } });
                    if (result.ok) setSharedLeads((items) => items.map((item) => item.id === l.id ? { ...item, stage } : item));
                    else setLoadError(result.error);
                    setSavingId(null);
                  }}
                  className="mt-1 h-11 w-full rounded-md border-2 border-outline-variant bg-surface-lowest px-2 text-sm font-semibold text-on-surface disabled:opacity-60"
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
      ) : null}
    </>
  );
}
