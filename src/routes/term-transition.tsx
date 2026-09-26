import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Icon } from "@/components/Icon";
import { Card, Field, PrimaryButton, SectionTitle } from "@/components/ui-kit";
import { dateInput, fromDateInput, ugx, useStore } from "@/lib/store";
import {
  exportTermReportCard,
  holidayPauseMessage,
  openWhatsApp,
  shelfQty,
} from "@/lib/operator-helpers";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/term-transition")({
  head: () => ({
    meta: [
      { title: "Close the Term — SmartCanteen" },
      {
        name: "description",
        content:
          "Close out the term, share the report card, and carry your cash into the new term.",
      },
      { property: "og:title", content: "Close the Term — SmartCanteen" },
      {
        property: "og:description",
        content: "Nothing is lost between terms: cash at hand rolls forward. Share a term report card.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TermTransition,
});

function TermTransition() {
  const { state, cashAtHand, totals, archiveTerm, setHoliday } = useStore();
  const { user } = useAuth();
  const navigate = useNavigate();

  const shelfValue = state.items.reduce(
    (sum, i) => sum + (i.qty ? (i.buy / i.qty) * shelfQty(i) : 0),
    0,
  );
  const outstanding = state.debtors
    .filter((d) => !d.paid)
    .reduce(
      (s, d) => s + Math.max(0, d.amount - (d.payments ?? []).reduce((a, p) => a + p.amount, 0)),
      0,
    );
  const profit = totals.sales - totals.expenses - totals.stock;
  const expectedProfit = state.items.reduce((sum, item) => sum + item.qty * item.sell - item.buy, 0);

  const year = new Date().getFullYear();
  const termMatch = /Term\s*(\d)/i.exec(state.termName);
  const nextNum = termMatch ? Number(termMatch[1]) + 1 : 1;
  const [newTerm, setNewTerm] = useState(`Term ${nextNum}, ${year}`);
  const [carryStock, setCarryStock] = useState(true);
  const [goal, setGoal] = useState(
    String(state.savingsGoal || Math.round((cashAtHand + shelfValue) * 2)),
  );
  const [pauseHoliday, setPauseHoliday] = useState(false);
  const [holidayEnd, setHolidayEnd] = useState(dateInput(Date.now() + 45 * 86400000));
  const [nextOpen, setNextOpen] = useState(dateInput(Date.now() + 50 * 86400000));
  const [done, setDone] = useState(false);
  const [lastOpening, setLastOpening] = useState(0);
  const [closedName, setClosedName] = useState(state.termName);

  const opening = Math.round(cashAtHand + (carryStock ? shelfValue : 0));

  const shareCard = () => {
    exportTermReportCard({
      termName: closedName || state.termName,
      school: user?.school,
      sales: totals.sales,
      stock: totals.stock,
      expenses: totals.expenses,
      net: profit,
      expectedProfit,
      outstanding,
      cashAtHand,
      goal: state.savingsGoal,
      startedAt: state.termStartedAt,
    });
  };

  const finish = () => {
    setClosedName(state.termName);
    shareCard();
    archiveTerm(newTerm.trim() || "Next term", opening, Number(goal) || 0);
    setLastOpening(opening);
    if (pauseHoliday) {
      const until = fromDateInput(holidayEnd);
      const opens = fromDateInput(nextOpen);
      setHoliday(until, opens);
      openWhatsApp(
        holidayPauseMessage({
          termName: newTerm.trim() || "Next term",
          untilLabel: new Date(until).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }),
          nextTermLabel: new Date(opens).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }),
        }),
        state.digestPhone,
      );
    } else {
      setHoliday(null);
    }
    setDone(true);
  };

  if (done) {
    return (
      <AppLayout title="Term closed" back>
        <Card className="space-y-3 bg-primary/10">
          <p className="text-lg font-bold text-primary">Term closed. Well done.</p>
          <p className="text-sm text-on-surface">
            {closedName} is archived. New term opens with money in hand UGX {ugx(lastOpening)}.
          </p>
          <p className="text-sm text-on-surface-variant">
            A term report card opened — use Print → Save as PDF to share with family or school.
          </p>
          {pauseHoliday ? (
            <p className="text-sm text-on-surface">Holiday pause is on until school resumes.</p>
          ) : null}
          <button
            type="button"
            onClick={shareCard}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-outline-variant font-bold text-primary"
          >
            <Icon name="picture_as_pdf" /> Open report card again
          </button>
          <PrimaryButton onClick={() => navigate({ to: "/" })}>
            <Icon name="home" /> Back to Home
          </PrimaryButton>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Close term" back>
      <Card className="space-y-sm">
        <p className="label-bold text-on-surface-variant">{state.termName} — closing position</p>
        <p className="price-display text-primary">UGX {ugx(cashAtHand)}</p>
        <p className="text-sm text-on-surface-variant">Money in hand right now</p>
      </Card>

      <SectionTitle>What this term produced</SectionTitle>
      <Card className="space-y-2 text-sm">
        <Row label="Total sales" value={totals.sales} />
        <Row label="Stock bought" value={-totals.stock} />
        <Row label="Expenses" value={-totals.expenses} />
        <div className="border-t border-outline-variant pt-2">
          <Row label="Real profit" value={profit} bold />
        </div>
        <Row label="Stock still on the shelf (at cost)" value={shelfValue} />
        <Row label="Money still owed by students" value={outstanding} />
      </Card>

      <button
        type="button"
        onClick={shareCard}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-outline-variant font-bold text-primary"
      >
        <Icon name="picture_as_pdf" /> Preview term report card (PDF)
      </button>

      <SectionTitle>Open the new term</SectionTitle>
      <Card className="space-y-sm">
        <Field label="New term name" value={newTerm} onChange={(e) => setNewTerm(e.target.value)} />
        <Field
          label="Savings goal for the new term (UGX)"
          inputMode="numeric"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setCarryStock((c) => !c)}
          className="flex w-full items-center justify-between rounded-md border-2 border-outline-variant p-3 text-left"
        >
          <span className="text-sm font-semibold text-on-surface">
            Carry shelf stock forward as capital
            <span className="block text-xs font-normal text-on-surface-variant">
              Adds UGX {ugx(shelfValue)} of unsold stock to the opening balance
            </span>
          </span>
          <Icon
            name={carryStock ? "toggle_on" : "toggle_off"}
            className={carryStock ? "text-primary" : "text-outline"}
          />
        </button>
      </Card>

      <Card className="space-y-1">
        <p className="label-bold text-on-surface-variant">New opening capital</p>
        <p className="price-display text-primary">UGX {ugx(opening)}</p>
      </Card>

      <Card className="space-y-sm">
        <button
          type="button"
          onClick={() => setPauseHoliday((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="text-sm font-bold text-on-surface">
            School holiday next?
            <span className="mt-0.5 block text-xs font-normal text-on-surface-variant">
              Pause daily close until school opens again. Books stay safe.
            </span>
          </span>
          <Icon
            name={pauseHoliday ? "toggle_on" : "toggle_off"}
            className={pauseHoliday ? "text-primary" : "text-outline"}
          />
        </button>
        {pauseHoliday && (
          <div className="grid gap-sm sm:grid-cols-2">
            <Field
              label="Holiday ends"
              type="date"
              value={holidayEnd}
              onChange={(e) => setHolidayEnd(e.target.value)}
            />
            <Field
              label="Next term opens around"
              type="date"
              value={nextOpen}
              onChange={(e) => setNextOpen(e.target.value)}
            />
          </div>
        )}
      </Card>

      <div className="rounded-lg border border-secondary-container bg-secondary-fixed/50 p-sm text-sm text-on-secondary-container">
        Unpaid student credit stays on the list. Closing also opens a shareable term report card.
      </div>

      <PrimaryButton tone="cta" onClick={finish}>
        Close term & open {newTerm} <Icon name="event_repeat" />
      </PrimaryButton>
    </AppLayout>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? "font-bold text-on-surface" : "text-on-surface-variant"}>{label}</span>
      <span
        className={`${bold ? "font-bold" : "font-semibold"} tabular-nums ${value < 0 ? "text-tertiary" : "text-on-surface"}`}
      >
        UGX {ugx(Math.abs(value))}
      </span>
    </div>
  );
}
