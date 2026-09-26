import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui-kit";
import { fmtDate, usePlatform } from "@/lib/platform";

export const Route = createFileRoute("/admin/activity")({
  head: () => ({
    meta: [{ title: "Activity — SmartCanteen Admin" }],
  }),
  component: ActivityPage,
});

function ActivityPage() {
  const { s } = usePlatform();
  const log = [...(s.auditLog ?? [])].sort((a, b) => b.ts - a.ts);

  return (
    <>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-primary">Accountability</p>
        <h1 className="text-2xl font-extrabold text-on-surface sm:text-3xl">Activity log</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Renewals, suspensions, OTP resets, certifications and other admin actions.
        </p>
      </div>

      <Card className="divide-y divide-outline-variant/50 p-0">
        {log.length === 0 ? (
          <p className="p-4 text-sm text-on-surface-variant">No actions recorded yet.</p>
        ) : null}
        {log.slice(0, 200).map((e) => (
          <div key={e.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-on-surface">{e.action}</p>
              <p className="text-xs text-on-surface-variant">by {e.who}</p>
            </div>
            <p className="shrink-0 text-xs tabular-nums text-on-surface-variant">
              {fmtDate(e.ts)} ·{" "}
              {new Date(e.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        ))}
      </Card>
    </>
  );
}
