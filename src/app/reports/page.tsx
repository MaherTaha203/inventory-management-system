"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Kind = "stocktake" | "receipt";
type ColumnKey =
  | "operation_number"
  | "operation_date"
  | "receipt_number"
  | "receipt_date"
  | "item_name"
  | "quantity"
  | "unit_name"
  | "supplier_name";

interface ReportLine {
  id: string;
  item_name_snapshot: string;
  quantity: number | string;
  unit_name_snapshot: string | null;
}
interface ReportEntry {
  id: string;
  operation_number?: string;
  operation_date?: string;
  receipt_number?: number;
  receipt_date?: string;
  supplier_name_snapshot?: string | null;
  stocktake_lines?: ReportLine[];
  receipt_lines?: ReportLine[];
}
interface ReportResponse {
  entries: ReportEntry[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
}
const definitions: Record<Kind, { key: ColumnKey; label: string; required: boolean }[]> = {
  stocktake: [
    { key: "operation_number", label: "رقم العملية", required: true },
    { key: "operation_date", label: "التاريخ", required: true },
    { key: "item_name", label: "الصنف", required: true },
    { key: "quantity", label: "الكمية", required: true },
    { key: "unit_name", label: "الوحدة", required: false },
  ],
  receipt: [
    { key: "receipt_number", label: "رقم السند", required: true },
    { key: "receipt_date", label: "التاريخ", required: true },
    { key: "item_name", label: "الصنف", required: true },
    { key: "quantity", label: "الكمية", required: true },
    { key: "unit_name", label: "الوحدة", required: false },
    { key: "supplier_name", label: "المورد", required: false },
  ],
};
const defaults: Record<Kind, ColumnKey[]> = {
  stocktake: ["operation_number", "operation_date", "item_name", "quantity", "unit_name"],
  receipt: ["receipt_number", "receipt_date", "item_name", "quantity", "unit_name", "supplier_name"],
};

function formatDate(value?: string) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}
function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] ?? char);
}

export default function ReportsPage() {
  const [kind, setKind] = useState<Kind>("stocktake");
  const [entries, setEntries] = useState<ReportEntry[]>([]);
  const [columns, setColumns] = useState<Record<Kind, ColumnKey[]>>(defaults);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/reports/preferences", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("تعذر تحميل تفضيلات الأعمدة.");
        return response.json() as Promise<{ stocktake: ColumnKey[]; receipt: ColumnKey[] }>;
      })
      .then((result) => {
        if (active) setColumns({ stocktake: result.stocktake, receipt: result.receipt });
      })
      .catch(() => {
        if (active) setMessage("تعذر تحميل تفضيلات الأعمدة؛ عُرضت الأعمدة الافتراضية.");
      })
      .finally(() => {
        if (active) setPreferencesLoaded(true);
      });
    return () => { active = false; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams({ page: String(page) });
    if (search.trim()) params.set("q", search.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    try {
      const endpoint = kind === "stocktake" ? "/api/operations/stocktakes" : "/api/operations/receipts";
      const response = await fetch(`${endpoint}?${params.toString()}`, { cache: "no-store" });
      const result = await response.json() as ReportResponse | { error?: string };
      if (!response.ok || !("entries" in result)) {
        throw new Error("error" in result ? result.error : "تعذر تحميل التقرير.");
      }
      setEntries(result.entries);
      setTotalPages(result.totalPages);
      setTotalRows(result.totalRows);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "تعذر تحميل التقرير.");
    } finally {
      setLoading(false);
    }
  }, [from, kind, page, search, to]);

  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);

  const rows = useMemo(() => entries.flatMap((entry) => {
    const lines = kind === "stocktake" ? entry.stocktake_lines ?? [] : entry.receipt_lines ?? [];
    return lines.map((line) => ({
      operation_number: entry.operation_number ?? "",
      operation_date: formatDate(entry.operation_date),
      receipt_number: String(entry.receipt_number ?? ""),
      receipt_date: formatDate(entry.receipt_date),
      item_name: line.item_name_snapshot,
      quantity: String(line.quantity),
      unit_name: line.unit_name_snapshot ?? "",
      supplier_name: entry.supplier_name_snapshot ?? "",
    }));
  }), [entries, kind]);

  async function saveColumns(next: ColumnKey[]) {
    const required = definitions[kind].filter((column) => column.required).map((column) => column.key);
    const selected = [...new Set([...required, ...next])];
    setColumns((current) => ({ ...current, [kind]: selected }));
    try {
      const response = await fetch("/api/reports/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, columns: selected }),
      });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error ?? "تعذر حفظ تفضيلات الأعمدة.");
      }
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "تعذر حفظ تفضيلات الأعمدة.");
    }
  }

  function exportExcel() {
    const visible = definitions[kind].filter((column) => columns[kind].includes(column.key));
    const head = visible.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
    const body = rows.map((row) =>
      `<tr>${visible.map((column) => `<td>${escapeHtml(row[column.key] ?? "")}</td>`).join("")}</tr>`
    ).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body dir="rtl"><table dir="rtl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
    const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = kind === "stocktake" ? "تقرير-الجرد.xls" : "تقرير-الاستلام.xls";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function printReport() {
    const visible = definitions[kind].filter((column) => columns[kind].includes(column.key));
    const head = visible.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
    const body = rows.map((row) =>
      `<tr>${visible.map((column) => `<td>${escapeHtml(row[column.key] ?? "")}</td>`).join("")}</tr>`
    ).join("");
    const html = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>تقرير ${kind === "stocktake" ? "الجرد" : "الاستلام"}</title><style>body{font-family:Arial,sans-serif;direction:rtl;padding:20px}h1{font-size:18px}table{border-collapse:collapse;width:100%;direction:rtl}th,td{border:1px solid #999;padding:7px;text-align:right;font-size:12px}th{background:#eee}@page{size:A4 landscape;margin:12mm}</style><body><h1>تقرير ${kind === "stocktake" ? "الجرد" : "الاستلام"}</h1><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
    const popup = window.open("", "_blank");
    if (!popup) {
      setMessage("يرجى السماح بفتح نافذة الطباعة.");
      return;
    }
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  function switchKind(next: Kind) {
    setKind(next);
    setPage(1);
    setSearch("");
    setFrom("");
    setTo("");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-8 sm:px-6">
      <nav className="mb-8 flex items-center justify-between">
        <Link href="/" className="text-sm font-semibold text-[var(--accent)]">← الرئيسية</Link>
        <Link href="/archive" className="text-sm font-semibold text-[var(--accent)]">الأرشيف</Link>
      </nav>
      <header className="mb-6">
        <h1 className="text-2xl font-bold">التقارير</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">تصفية السجلات وعرض الأعمدة المطلوبة وتصدير النتائج الظاهرة.</p>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
        <button type="button" onClick={() => switchKind("stocktake")} aria-pressed={kind === "stocktake"} className={kind === "stocktake" ? "rounded-lg bg-white px-4 py-3 text-sm font-semibold shadow-sm" : "rounded-lg px-4 py-3 text-sm"}>الجرد</button>
        <button type="button" onClick={() => switchKind("receipt")} aria-pressed={kind === "receipt"} className={kind === "receipt" ? "rounded-lg bg-white px-4 py-3 text-sm font-semibold shadow-sm" : "rounded-lg px-4 py-3 text-sm"}>الاستلام</button>
      </div>

      <section className="mb-5 grid gap-3 rounded-2xl border border-[var(--border)] bg-white p-4 sm:grid-cols-3">
        <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="بحث برقم العملية أو الصنف أو المورد" className="rounded-xl border border-[var(--border)] px-4 py-3" />
        <label className="text-xs text-[var(--muted)]">من تاريخ<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-3 text-sm text-[var(--foreground)]" /></label>
        <label className="text-xs text-[var(--muted)]">إلى تاريخ<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-3 text-sm text-[var(--foreground)]" /></label>
      </section>

      <section className="mb-5 rounded-2xl border border-[var(--border)] bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">الأعمدة الظاهرة</h2>
        <div className="flex flex-wrap gap-4">
          {definitions[kind].map((column) => (
            <label key={column.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={columns[kind].includes(column.key)} disabled={column.required || !preferencesLoaded} onChange={(event) => {
                const next = event.target.checked
                  ? [...columns[kind], column.key]
                  : columns[kind].filter((key) => key !== column.key);
                void saveColumns(next);
              }} />
              {column.label}
            </label>
          ))}
        </div>
      </section>

      {message && <p role="status" className="mb-4 rounded-xl bg-slate-100 p-3 text-sm">{message}</p>}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-[var(--muted)]">عدد العمليات: {totalRows} · عدد السطور في الصفحة: {rows.length}</span>
        <div className="flex gap-2">
          <button type="button" disabled={rows.length === 0 || loading} onClick={exportExcel} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold">تصدير Excel</button>
          <button type="button" disabled={rows.length === 0 || loading} onClick={printReport} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold">طباعة / PDF</button>
        </div>
      </div>

      {loading ? <p role="status" className="rounded-xl border border-[var(--border)] bg-white p-5 text-sm text-[var(--muted)]">جارٍ تحميل التقرير…</p> :
        rows.length === 0 ? <p className="rounded-xl border border-[var(--border)] bg-white p-5 text-sm text-[var(--muted)]">لا توجد نتائج مطابقة لمعايير البحث.</p> :
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
          <table className="w-full min-w-[520px] text-right text-sm">
            <thead className="bg-slate-50 text-xs text-[var(--muted)]"><tr>{definitions[kind].filter((column) => columns[kind].includes(column.key)).map((column) => <th key={column.key} className="whitespace-nowrap px-4 py-3 font-semibold">{column.label}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--border)]">{rows.map((row,index) => <tr key={index}>{definitions[kind].filter((column) => columns[kind].includes(column.key)).map((column) => <td key={column.key} className="whitespace-nowrap px-4 py-3">{row[column.key]}</td>)}</tr>)}</tbody>
          </table>
        </div>
      }

      {totalPages > 1 && <div className="mt-5 flex items-center justify-between">
        <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-40">السابق</button>
        <span className="text-xs text-[var(--muted)]">صفحة {page} من {totalPages}</span>
        <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-40">التالي</button>
      </div>}
    </main>
  );
}
