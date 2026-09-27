/** Shared, standards-friendly export helpers (CSV, Excel XML, print-to-PDF). */

export type Sheet = {
  name: string;
  columns: string[];
  rows: (string | number)[][];
  /** Optional summary lines rendered above the table in PDF exports. */
  summary?: [string, string][];
};

const stamp = () => new Date().toISOString().slice(0, 10);

function download(filename: string, mime: string, content: string) {
  const blob = new Blob(["\uFEFF" + content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvCell = (v: string | number) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportCsv(baseName: string, sheet: Sheet) {
  const lines = [sheet.columns.map(csvCell).join(","), ...sheet.rows.map((r) => r.map(csvCell).join(","))];
  download(`${baseName}-${stamp()}.csv`, "text/csv", lines.join("\r\n"));
}

const xmlEscape = (v: string | number) =>
  String(v ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

/** Real multi-sheet Excel file (SpreadsheetML 2003) with a styled header row. */
export function exportExcel(baseName: string, sheets: Sheet[], title: string) {
  const body = sheets
    .map((sheet) => {
      const cols = sheet.columns.map(() => `<Column ss:AutoFitWidth="1" ss:Width="130"/>`).join("");
      const head = `<Row ss:StyleID="head">${sheet.columns
        .map((c) => `<Cell><Data ss:Type="String">${xmlEscape(c)}</Data></Cell>`)
        .join("")}</Row>`;
      const rows = sheet.rows
        .map(
          (r) =>
            `<Row>${r
              .map((c) =>
                typeof c === "number"
                  ? `<Cell ss:StyleID="num"><Data ss:Type="Number">${c}</Data></Cell>`
                  : `<Cell><Data ss:Type="String">${xmlEscape(c)}</Data></Cell>`,
              )
              .join("")}</Row>`,
        )
        .join("");
      const summary = (sheet.summary ?? [])
        .map(
          ([k, v]) =>
            `<Row><Cell ss:StyleID="bold"><Data ss:Type="String">${xmlEscape(k)}</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(v)}</Data></Cell></Row>`,
        )
        .join("");
      return `<Worksheet ss:Name="${xmlEscape(sheet.name).slice(0, 30)}"><Table>${cols}
        <Row ss:StyleID="title"><Cell><Data ss:Type="String">${xmlEscape(title)}</Data></Cell></Row>
        ${summary}<Row/>${head}${rows}</Table>
        <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions>
      </Worksheet>`;
    })
    .join("");

  const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Font ss:FontName="Calibri" ss:Size="11"/></Style>
  <Style ss:ID="title"><Font ss:Bold="1" ss:Size="14" ss:Color="#2F6B46"/></Style>
  <Style ss:ID="bold"><Font ss:Bold="1"/></Style>
  <Style ss:ID="head"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#2F6B46" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>
  <Style ss:ID="num"><NumberFormat ss:Format="#,##0"/></Style>
 </Styles>${body}</Workbook>`;
  download(`${baseName}-${stamp()}.xls`, "application/vnd.ms-excel", xml);
}

/** Opens a clean, branded, print-ready document — "Save as PDF" in the print dialog. */
export function exportPdf(title: string, subtitle: string, sheets: Sheet[]) {
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) {
    window.print();
    return;
  }
  const tables = sheets
    .map(
      (s) => `
      <section>
        <h2>${xmlEscape(s.name)}</h2>
        ${
          s.summary?.length
            ? `<div class="summary">${s.summary
                .map(([k, v]) => `<div><span>${xmlEscape(k)}</span><strong>${xmlEscape(v)}</strong></div>`)
                .join("")}</div>`
            : ""
        }
        <table>
          <thead><tr>${s.columns.map((c) => `<th>${xmlEscape(c)}</th>`).join("")}</tr></thead>
          <tbody>${s.rows
            .map(
              (r) =>
                `<tr>${r
                  .map(
                    (c) =>
                      `<td class="${typeof c === "number" ? "num" : ""}">${
                        typeof c === "number" ? c.toLocaleString("en-UG") : xmlEscape(c)
                      }</td>`,
                  )
                  .join("")}</tr>`,
            )
            .join("")}</tbody>
        </table>
      </section>`,
    )
    .join("");

  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${xmlEscape(title)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #26302a; margin: 0; }
    header { border-bottom: 3px solid #2f6b46; padding-bottom: 10px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-end; }
    h1 { margin: 0; font-size: 20px; color: #2f6b46; }
    .sub { color: #6b736c; font-size: 12px; }
    h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: #6b736c; margin: 22px 0 8px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-bottom: 10px; }
    .summary div { border: 1px solid #dde3dd; border-radius: 8px; padding: 8px 10px; }
    .summary span { display: block; font-size: 10px; text-transform: uppercase; color: #6b736c; }
    .summary strong { font-size: 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #2f6b46; color: #fff; text-align: left; padding: 7px 8px; }
    td { padding: 6px 8px; border-bottom: 1px solid #e4e8e3; }
    td.num, th:last-child { text-align: right; }
    tbody tr:nth-child(even) { background: #f6f8f5; }
    footer { margin-top: 24px; font-size: 10px; color: #8a918a; text-align: center; }
    section { page-break-inside: auto; }
  </style></head><body>
  <header><div><h1>SmartCanteen</h1><div class="sub">${xmlEscape(title)}</div></div>
  <div class="sub">${xmlEscape(subtitle)}</div></header>
  ${tables}
  <footer>Generated by SmartCanteen · ${new Date().toLocaleString("en-GB")}</footer>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };<\/script>
  </body></html>`);
  win.document.close();
}

/** Branded payment receipt for a confirmed subscription payment. */
export function exportPaymentReceipt(opts: {
  canteenName: string;
  operatorName: string;
  school: string;
  termName?: string;
  amount: number;
  method: string;
  transactionId: string;
  accessUntil: number;
  months: number;
  paidAt: number;
  confirmedBy: string;
  receiptNo: string;
}) {
  const win = window.open("", "_blank", "width=720,height=900");
  if (!win) return;
  const money = (n: number) => `UGX ${Math.round(n).toLocaleString("en-UG")}`;
  const d = (ts: number) =>
    new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${xmlEscape(opts.receiptNo)}</title>
  <style>
    @page { size: A5; margin: 12mm; }
    body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1a241e; margin: 0; }
    .card { border: 2px solid #2f6b46; border-radius: 12px; padding: 20px; max-width: 480px; margin: 12px auto; }
    h1 { margin: 0; color: #2f6b46; font-size: 22px; }
    .sub { color: #5c665e; font-size: 12px; margin-top: 4px; }
    .amount { font-size: 28px; font-weight: 800; color: #2f6b46; margin: 16px 0 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 12px; }
    td { padding: 6px 0; border-bottom: 1px solid #e4e8e3; vertical-align: top; }
    td.k { color: #5c665e; width: 42%; }
    td.v { font-weight: 600; text-align: right; }
    .ok { display: inline-block; background: #e7f3ec; color: #2f6b46; font-weight: 700; font-size: 12px; padding: 4px 10px; border-radius: 999px; }
    footer { margin-top: 18px; font-size: 10px; color: #8a918a; text-align: center; }
  </style></head><body>
  <div class="card">
    <h1>SmartCanteen</h1>
    <div class="sub">Subscription payment receipt</div>
    <div class="ok">Payment confirmed</div>
    <div class="amount">${money(opts.amount)}</div>
    <div class="sub">Receipt ${xmlEscape(opts.receiptNo)}</div>
    <table>
      <tr><td class="k">Canteen</td><td class="v">${xmlEscape(opts.canteenName)}</td></tr>
      <tr><td class="k">Operator</td><td class="v">${xmlEscape(opts.operatorName)}</td></tr>
      <tr><td class="k">School</td><td class="v">${xmlEscape(opts.school)}</td></tr>
      ${opts.termName ? `<tr><td class="k">Term</td><td class="v">${xmlEscape(opts.termName)}</td></tr>` : ""}
      <tr><td class="k">Mode of payment</td><td class="v">${xmlEscape(opts.method)}</td></tr>
      <tr><td class="k">Transaction ID</td><td class="v">${xmlEscape(opts.transactionId)}</td></tr>
      <tr><td class="k">Paid on</td><td class="v">${d(opts.paidAt)}</td></tr>
      <tr><td class="k">Access covers</td><td class="v">${opts.months} month${opts.months === 1 ? "" : "s"}</td></tr>
      <tr><td class="k">Access until</td><td class="v">${d(opts.accessUntil)}</td></tr>
      <tr><td class="k">Confirmed by</td><td class="v">${xmlEscape(opts.confirmedBy)}</td></tr>
    </table>
    <footer>Keep this receipt for your school records · SmartCanteen</footer>
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script>
  </body></html>`);
  win.document.close();
}
