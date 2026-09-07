import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Icon } from "./Icon";

/**
 * New-user guided tour. Each step points an arrow at a real element on the
 * page (marked with data-tour="id") and explains what it is for and why it
 * matters — the same way a new user is walked through a mobile money app.
 */

export type TourStep = {
  id: string;
  title: string;
  body: string;
  /** Runs before the step is shown — e.g. switch to the tab holding the button. */
  before?: () => void;
};


const seenKey = (tourId: string, userId: string) => `smartcanteen.tour.${tourId}.${userId}`;

export function useTour(tourId: string, userId: string | undefined, enabled: boolean) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled || !userId) return;
    try {
      if (!localStorage.getItem(seenKey(tourId, userId))) setOpen(true);
    } catch {
      /* ignore */
    }
  }, [tourId, userId, enabled]);

  const finish = useCallback(() => {
    setOpen(false);
    if (!userId) return;
    try {
      localStorage.setItem(seenKey(tourId, userId), "1");
    } catch {
      /* ignore */
    }
  }, [tourId, userId]);

  const restart = useCallback(() => setOpen(true), []);

  return { open, finish, restart };
}

type Box = { top: number; left: number; width: number; height: number };

export function Tour({
  steps,
  open,
  onClose,
}: {
  steps: TourStep[];
  open: boolean;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const step = steps[i];

  useEffect(() => {
    if (open) setI(0);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !step) return;
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.id}"]`);
      if (!el) return setBox(null);
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      const r = el.getBoundingClientRect();
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    const t = setTimeout(measure, 320);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step, i]);

  if (!open || !step) return null;

  const below = !box || box.top < 220;
  const cardTop = box ? (below ? box.top + box.height + 16 : Math.max(12, box.top - 190)) : 120;

  return (
    <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true" aria-label="Feature guide">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {box ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-4 ring-secondary-container"
          style={{
            top: box.top - 6,
            left: box.left - 6,
            width: box.width + 12,
            height: box.height + 12,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
          }}
        />
      ) : null}

      <div
        className="absolute left-1/2 w-[min(92vw,380px)] -translate-x-1/2 rounded-xl bg-surface-lowest p-4 shadow-raised"
        style={{ top: cardTop }}
      >
        {box ? (
          <span
            aria-hidden
            className={`absolute left-1/2 -translate-x-1/2 text-secondary-container ${
              below ? "-top-7" : "-bottom-7"
            }`}
          >
            <Icon name={below ? "arrow_upward" : "arrow_downward"} className="text-[28px]" />
          </span>
        ) : null}

        <p className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
          Step {i + 1} of {steps.length}
        </p>
        <h3 className="mt-1 text-lg font-bold text-on-surface">{step.title}</h3>
        <p className="mt-1 text-sm text-on-surface-variant">{step.body}</p>

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={onClose}
            className="min-h-11 flex-1 rounded-md border-2 border-outline-variant text-sm font-bold text-on-surface-variant"
          >
            Skip
          </button>
          {i > 0 ? (
            <button
              onClick={() => setI((x) => x - 1)}
              className="min-h-11 flex-1 rounded-md border-2 border-outline-variant text-sm font-bold text-on-surface-variant"
            >
              Back
            </button>
          ) : null}
          <button
            onClick={() => (i === steps.length - 1 ? onClose() : setI((x) => x + 1))}
            className="min-h-11 flex-[2] rounded-md bg-primary text-sm font-bold text-on-primary"
          >
            {i === steps.length - 1 ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
