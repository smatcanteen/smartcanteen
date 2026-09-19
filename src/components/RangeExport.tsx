import { useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon";
import { exportExcel, exportPdf, type Sheet } from "@/lib/export";
import { dateInput, fromDateInput } from "@/lib/store";

export type RangeKey = "Today" | "Week" | "Term" | "Custom";

const startOfDay = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const endOfDay = (ts: number) => startOfDay(ts) + 86400000 - 1;

/**
 * One date-range control shared by Reports, Credit, Expense, Stock and Sales
 * so the operator only ever learns the pattern once.
 */
export function useRange(termStartedAt?: number) {
  const [key, setKey] = useState<RangeKey>("Term");
  const [from, setFrom] = useState(dateInput(Date.now() - 6 * 86400000));
  const [to, setTo] = useState(dateInput(Date.now()));

  const window = useMemo(() => {
    const now = Date.now();
    if (key === "Today") return { start: startOfDay(now), end: endOfDay(now) };
    if (key === "Week") {
      const today = new Date(now);
      const mondayOffset = (today.getDay() + 6) % 7;
      return { start: startOfDay(now - mondayOffset * 86400000), end: endOfDay(now) };
    }
    if (key === "Custom") {
      const a = startOfDay(fromDateInput(from));
      const b = endOfDay(fromDateInput(to));
      return { start: Math.min(a, b), end: Math.max(a, b) };
    }
    return { start: termStartedAt ? startOfDay(termStartedAt) : 0, end: endOfDay(now) };
  }, [key, from, to, termStartedAt]);

  const label =
    key === "Custom"
      ? `${new Date(window.start).toLocaleDateString("en-GB")} – ${new Date(window.end).toLocaleDateString("en-GB")}`
      : key === "Week"
        ? "This week"
        : key === "Today"
          ? "Today"
          : "This term";

  return {
    key,
    setKey,
    from,
    setFrom,
    to,
    setTo,
    start: window.start,
    end: window.end,
    label,
    /** True when the timestamp falls inside the selected window. */
    has: (ts: number) => ts >= window.start && ts <= window.end,
    /** The same-length window immediately before this one. */
    previous: { start: window.start - (window.end - window.start) - 1, end: window.start - 1 },
  };
}

export type Range = ReturnType<typeof useRange>;

export function RangeBar({
  range,
  title,
  subtitle,
  sheets,
  baseName,
}: {
  range: Range;
  /** Document title used on the PDF and Excel exports. */
  title: string;
  subtitle?: string;
  sheets: Sheet[];
  baseName: string;
}) {
  const keys: RangeKey[] = ["Today", "Week", "Term", "Custom"];
  const names: Record<RangeKey, string> = {
    Today: "Today",
    Week: "This Week",
    Term: "This Term",
    Custom: "Custom",
  };
  return (
    <div className="space-y-sm">
      <div className="grid grid-cols-4 gap-2">
        {keys.map((k) => (
          <button
            key={k}
            onClick={() => range.setKey(k)}
            aria-pressed={range.key === k}
            className={`h-10 min-h-10 truncate rounded-full px-2 text-xs font-bold sm:text-sm ${
              range.key === k ? "bg-primary text-on-primary" : "bg-surface-high text-on-surface-variant"
            }`}
          >
            {names[k]}
          </button>
        ))}
      </div>

      {range.key === "Custom" && (
        <div className="grid gap-sm sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-on-surface-variant">From</span>
            <input
              type="date"
              value={range.from}
              onChange={(e) => range.setFrom(e.target.value)}
              className="h-11 min-h-11 w-full rounded-md border-2 border-outline-variant bg-surface-lowest px-3 text-sm font-semibold text-on-surface"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-on-surface-variant">To</span>
            <input
              type="date"
              value={range.to}
              onChange={(e) => range.setTo(e.target.value)}
              className="h-11 min-h-11 w-full rounded-md border-2 border-outline-variant bg-surface-lowest px-3 text-sm font-semibold text-on-surface"
            />
          </label>
        </div>
      )}

      <div className="flex gap-sm">
        <button
          onClick={() => exportPdf(title, subtitle ?? range.label, sheets)}
          className="flex h-11 min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-sm font-bold text-on-primary"
        >
          <Icon name="picture_as_pdf" className="text-[18px]" /> Export PDF
        </button>
        <button
          onClick={() => exportExcel(baseName, sheets, title)}
          className="flex h-11 min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-secondary-container text-sm font-bold text-on-secondary-container"
        >
          <Icon name="table_view" className="text-[18px]" /> Export Excel
        </button>
      </div>
    </div>
  );
}

/** Small responsive table used by the new summary views. */
export function DataTable({
  columns,
  rows,
  pageSize = 10,
  empty = "Nothing in this period yet.",
}: {
  columns: string[];
  rows: (string | number)[][];
  pageSize?: number;
  empty?: string;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages - 1);
  useEffect(() => setPage(0), [rows.length, pageSize]);
  const slice = rows.slice(current * pageSize, current * pageSize + pageSize);

  if (rows.length === 0) return <p className="text-sm text-on-surface-variant">{empty}</p>;

  return (
    <div className="space-y-sm">
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant text-left">
              {columns.map((c, i) => (
                <th
                  key={c}
                  className={`px-2 py-2 text-xs font-bold uppercase tracking-wide text-on-surface-variant ${
                    i === columns.length - 1 ? "text-right" : ""
                  }`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((r, ri) => (
              <tr key={ri} className="border-b border-outline-variant/40 last:border-0">
                {r.map((c, ci) => (
                  <td
                    key={ci}
                    className={`px-2 py-2 ${ci === r.length - 1 ? "text-right font-bold text-on-surface" : "text-on-surface-variant"}`}
                  >
                    {typeof c === "number" ? c.toLocaleString("en-UG") : c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage(Math.max(0, current - 1))}
            disabled={current === 0}
            className="h-10 min-h-10 rounded-full bg-surface-high px-4 text-sm font-bold text-on-surface-variant disabled:opacity-40"
          >
            Back
          </button>
          <span className="text-xs text-on-surface-variant">
            Page {current + 1} of {pages}
          </span>
          <button
            onClick={() => setPage(Math.min(pages - 1, current + 1))}
            disabled={current >= pages - 1}
            className="h-10 min-h-10 rounded-full bg-surface-high px-4 text-sm font-bold text-on-surface-variant disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
