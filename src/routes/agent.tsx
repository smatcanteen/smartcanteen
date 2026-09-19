import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Card, Field, PrimaryButton, SectionTitle, SelectField } from "@/components/ui-kit";
import { Kpi, Pill } from "@/components/AdminShell";
import { homeForRole, useAuth } from "@/lib/auth";
import { ugx } from "@/lib/store";
import {
  fmtDate,
  stageLabels,
  statusLabels,
  usePlatform,
  type LeadStage,
} from "@/lib/platform";
import { BrandLock } from "@/components/Brand";

export const Route = createFileRoute("/agent")({
  head: () => ({
    meta: [
      { title: "Field Agent Dashboard — SmartCanteen" },
      {
        name: "description",
        content:
          "Agents track leads, complete certification training, onboard canteens and follow their signup and trail commissions.",
      },
      { property: "og:title", content: "Field Agent Dashboard — SmartCanteen" },
      { property: "og:description", content: "Sell SmartCanteen on the ground and get paid for retention, not volume." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AgentDashboard,
});

const quiz = [
  {
    q: "What is the first thing a new operator must set for the cash engine to work?",
    options: ["Opening term capital", "Their profile photo", "A savings goal"],
    answer: 0,
  },
  {
    q: "When can an uncertified agent activate a paying account?",
    options: ["Any time", "Never — certification comes first", "After three leads"],
    answer: 1,
  },
  {
    q: "How does the recurring trail commission work?",
    options: [
      "A one-off payment at signup",
      "A share of the subscription for as long as the account stays active",
      "A bonus for the most visits",
    ],
    answer: 1,
  },
];

const stages: LeadStage[] = ["contacted", "demo", "trial", "subscribed", "lost"];

function AgentDashboard() {
  const { user, ready, logout } = useAuth();
  const { s, addLead, setLeadStage, certifyAgent, requestPayout } = usePlatform();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"leads" | "accounts" | "earnings" | "training">("leads");
  const [lead, setLead] = useState({ school: "", contactName: "", phone: "" });
  const [answers, setAnswers] = useState<number[]>([]);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);

  useEffect(() => {
    const updateConnection = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!user) navigate({ to: "/login" });
    else if (user.role !== "agent") navigate({ to: homeForRole(user.role) });
  }, [ready, user, navigate]);

  const me = useMemo(() => s.agents.find((a) => a.accountId === user?.id), [s.agents, user]);

  useEffect(() => {
    if (!online || !me) return;
    s.leads
      .filter((lead) => lead.agentId === me.id && lead.queued)
      .forEach((lead) => setLeadStage(lead.id, lead.stage));
  }, [online, me, s.leads, setLeadStage]);

  if (!user || user.role !== "agent") return null;
  if (!me) return <p className="p-8 text-sm">This login is not linked to an agent profile yet.</p>;

  const myLeads = s.leads.filter((l) => l.agentId === me.id);
  const myAccounts = s.tenants.filter((t) => t.agentId === me.id);
  const myComms = s.commissions.filter((c) => c.agentId === me.id);
  const total = (status: string) =>
    myComms.filter((c) => c.status === status).reduce((a, c) => a + c.amount, 0);
  const owed = total("approved");

  const board = s.agents
    .map((a) => ({
      name: a.name,
      count: s.tenants.filter((t) => t.agentId === a.id && t.status === "active").length,
    }))
    .sort((x, y) => y.count - x.count);

  const score = answers.filter((a, i) => a === quiz[i]?.answer).length;
  const announcement = s.announcements.find((item) =>
    item.active &&
    ["agents", "both"].includes(item.audience ?? "operators") &&
    (!item.segment.agentId || item.segment.agentId === me.id),
  );

  return (
    <div className="min-h-screen bg-surface-high pb-16">
      <div className="bg-primary">
        <header className="mx-auto flex h-16 w-full max-w-container-max items-center justify-between gap-2 px-3 sm:px-4 md:px-gutter">
          <BrandLock variant="dark" size="sm" title="Field agent" context={`${me.name} · ${me.territory}`} />
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <span className="flex min-h-11 items-center gap-1 rounded-full px-3 text-xs font-bold text-on-primary/80">
              <span className={`h-2 w-2 rounded-full ${online ? "bg-green-300" : "bg-secondary-container"}`} />
              {online ? "Online" : "Offline — entries will sync"}
            </span>
            <button
              onClick={() => {
                logout();
                navigate({ to: "/login" });
              }}
              aria-label="Log out"
              className="rounded-full p-2 text-secondary-container hover:bg-on-primary/10"
            >
              <Icon name="logout" />
            </button>
          </div>
        </header>
        <nav className="mx-auto flex w-full max-w-container-max gap-1 overflow-x-auto px-3 pb-2 sm:px-4 md:px-gutter [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

          {(["leads", "accounts", "earnings", "training"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold capitalize ${
                tab === t ? "bg-on-primary text-primary" : "text-on-primary/80 hover:bg-on-primary/10"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
        {announcement ? (
          <div className="mx-auto w-full max-w-container-max px-3 pb-3 sm:px-4 md:px-gutter">
            <div className="rounded-md bg-on-primary/10 p-3">
              <p className="text-sm font-bold text-on-primary">{announcement.title}</p>
              <p className="text-xs text-on-primary/80">{announcement.body}</p>
            </div>
          </div>
        ) : null}
      </div>

      <main className="mx-auto w-full max-w-container-max space-y-md px-4 py-md md:px-gutter">
        {!me.certified ? (
          <Card className="flex items-center gap-2 bg-secondary-fixed">
            <Icon name="school" className="text-on-secondary-container" />
            <p className="text-sm font-semibold text-on-secondary-container">
              You can log leads, but you must pass the training quiz before activating a paying account.
            </p>
          </Card>
        ) : null}

        {tab === "leads" && (
          <>
            <Card className="space-y-sm">
              <SectionTitle>Capture a lead {online ? "" : "(will sync when back online)"}</SectionTitle>
              <div className="grid gap-sm sm:grid-cols-3">
                <Field label="School" value={lead.school} onChange={(e) => setLead({ ...lead, school: e.target.value })} />
                <Field label="Contact name" value={lead.contactName} onChange={(e) => setLead({ ...lead, contactName: e.target.value })} />
                <Field label="Phone" value={lead.phone} onChange={(e) => setLead({ ...lead, phone: e.target.value })} />
              </div>
              <PrimaryButton
                onClick={() => {
                  if (!lead.school.trim()) return;
                  addLead({
                    school: lead.school.trim(),
                    contactName: lead.contactName,
                    phone: lead.phone,
                    stage: "contacted",
                    agentId: me.id,
                    ...(online ? {} : { queued: true }),
                  });
                  setLead({ school: "", contactName: "", phone: "" });
                }}
              >
                <Icon name="add" /> Add lead
              </PrimaryButton>
            </Card>

            <div className="grid gap-md md:grid-cols-3 xl:grid-cols-5">
              {stages.map((stage) => (
                <div key={stage} className="space-y-sm">
                  <SectionTitle>
                    {stageLabels[stage]} ({myLeads.filter((l) => l.stage === stage).length})
                  </SectionTitle>
                  {myLeads
                    .filter((l) => l.stage === stage)
                    .map((l) => (
                      <Card key={l.id} className="space-y-1">
                        <p className="font-bold text-on-surface">{l.school}</p>
                        <p className="text-xs text-on-surface-variant">
                          {l.contactName} · {l.phone}
                        </p>
                        {l.queued ? <Pill tone="warn">Queued offline</Pill> : null}
                        <select
                          aria-label={`Move ${l.school}`}
                          value={l.stage}
                          onChange={(e) => setLeadStage(l.id, e.target.value as LeadStage)}
                          className="h-11 w-full rounded-md border-2 border-outline-variant bg-surface-lowest px-2 text-sm font-semibold"
                        >
                          {stages.map((x) => (
                            <option key={x} value={x}>
                              {stageLabels[x]}
                            </option>
                          ))}
                        </select>
                      </Card>
                    ))}
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "accounts" && (
          <div className="space-y-sm">
            <SectionTitle>Canteens you onboarded</SectionTitle>
            {myAccounts.map((t) => (
              <Card key={t.accountId} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold text-on-surface">{t.canteenName}</p>
                  <p className="truncate text-xs text-on-surface-variant">
                    {t.school} · joined {fmtDate(t.createdAt)}
                  </p>
                </div>
                <Pill tone={t.status === "active" ? "good" : t.status === "trial" ? "info" : "bad"}>
                  {statusLabels[t.status]}
                </Pill>
              </Card>
            ))}
            {myAccounts.length === 0 ? <Card>No accounts yet.</Card> : null}
          </div>
        )}

        {tab === "earnings" && (
          <>
            <div className="grid grid-cols-2 gap-sm md:grid-cols-4">
              <Kpi label="Pending" value={`UGX ${ugx(total("pending"))}`} />
              <Kpi label="Approved" value={`UGX ${ugx(owed)}`} />
              <Kpi label="Paid" value={`UGX ${ugx(total("paid"))}`} />
              <Kpi
                label="Signup vs trail"
                value={`${myComms.filter((c) => c.type === "signup").length} / ${myComms.filter((c) => c.type === "trail").length}`}
              />
            </div>
            <Card className="space-y-sm">
              <SectionTitle>Commission lines</SectionTitle>
              {myComms.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-md bg-surface-lowest p-3 text-sm">
                  <span>
                    {c.type === "signup" ? "Signup bonus" : `Trail ${c.period ?? ""}`} · {fmtDate(c.createdAt)}
                  </span>
                  <span className="flex items-center gap-2 font-bold">
                    UGX {ugx(c.amount)} <Pill tone={c.status === "paid" ? "good" : "warn"}>{c.status}</Pill>
                  </span>
                </div>
              ))}
              <PrimaryButton onClick={() => owed > 0 && requestPayout(me.id, owed)} disabled={owed <= 0}>
                <Icon name="request_quote" /> Request payout of UGX {ugx(owed)}
              </PrimaryButton>
              {s.payouts
                .filter((p) => p.agentId === me.id)
                .map((p) => (
                  <p key={p.id} className="text-xs text-on-surface-variant">
                    {fmtDate(p.ts)} — UGX {ugx(p.amount)} · {p.status}
                    {p.ref ? ` · ref ${p.ref}` : ""}
                  </p>
                ))}
            </Card>
            {s.settings.leaderboard ? (
              <Card className="space-y-1">
                <SectionTitle>Leaderboard — active accounts</SectionTitle>
                {board.map((b, i) => (
                  <p key={b.name} className="flex justify-between text-sm text-on-surface">
                    <span>
                      {i + 1}. {b.name}
                    </span>
                    <span className="font-bold">{b.count}</span>
                  </p>
                ))}
              </Card>
            ) : null}
          </>
        )}

        {tab === "training" && (
          <Card className="space-y-sm">
            <SectionTitle>Certification training</SectionTitle>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-on-surface-variant">
              <li>How SmartCanteen works: opening capital → stock → sales → cash at hand.</li>
              <li>Running a school demo in 10 minutes.</li>
              <li>Helping an operator log their first real sale on the same visit.</li>
            </ol>
            {quiz.map((item, i) => (
              <div key={item.q} className="rounded-md bg-surface-lowest p-3">
                <p className="text-sm font-bold text-on-surface">{item.q}</p>
                <SelectField
                  label="Your answer"
                  value={String(answers[i] ?? "")}
                  onChange={(e) => {
                    const next = [...answers];
                    next[i] = Number(e.target.value);
                    setAnswers(next);
                  }}
                >
                  <option value="">Choose…</option>
                  {item.options.map((o, oi) => (
                    <option key={o} value={oi}>
                      {o}
                    </option>
                  ))}
                </SelectField>
              </div>
            ))}
            <p className="text-sm font-semibold text-on-surface-variant">
              Score: {score}/{quiz.length}
            </p>
            <PrimaryButton
              tone="cta"
              disabled={me.certified || score < quiz.length}
              onClick={() => certifyAgent(me.id)}
            >
              {me.certified ? "Certified ✓" : "Submit quiz and get certified"}
            </PrimaryButton>
          </Card>
        )}
      </main>
    </div>
  );
}
