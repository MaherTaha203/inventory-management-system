"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useInventoryChanges } from "@/lib/realtime/use-inventory-changes";

type Kind = "stocktake" | "receipt";
type Line = { id: string; item_name_snapshot: string; quantity: number | string; unit_name_snapshot: string | null };
type Entry = {
  id: string;
  operation_number?: string;
  receipt_number?: number;
  operation_date?: string;
  receipt_date?: string;
  supplier_name_snapshot?: string | null;
  stocktake_lines?: Line[];
  receipt_lines?: Line[];
};
type Result = { entries: Entry[]; page: number; totalPages: number; totalRows: number };

function dateLabel(value?: string) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export default function OperationList({ kind }: { kind: Kind }) {
  const stocktake = kind === "stocktake";
  const [entries, setEntries] = useState<Entry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page) });
    if (search.trim()) params.set("q", search.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    try {
      const endpoint = stocktake ? "/api/operations/stocktakes" : "/api/operations/receipts";
      const response = await fetch(`${endpoint}?${params.toString()}`, { cache: "no-store" });
      const result = await response.json() as Result | { error?: string };
      if (!response.ok || !("entries" in result)) throw new Error("error" in result ? result.error : "تعذر تحميل العمليات.");
      setEntries(result.entries);
      setTotalPages(result.totalPages);
      setTotalRows(result.totalRows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل العمليات.");
    } finally {
      setLoading(false);
    }
  }, [from, page, search, stocktake, to]);

  useInventoryChanges(() => { void load(); });
  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);

  const title = stocktake ? "عمليات الجرد" : "سندات الاستلام";
  const createHref = stocktake ? "/stocktakes/new" : "/receipts/new";
  const importHref = stocktake ? "/stocktakes/import" : "/receipts/import";
  const archiveHref = `/archive?kind=${kind}`;

  return (
    <main className="operation-list-page">
      <header className="app-page-heading">
        <div>
          <p className="app-eyebrow">إدارة المخزون</p>
          <h1>{title}</h1>
          <p>تابع العمليات المسجلة وافتح أي عملية لمراجعتها أو تعديلها.</p>
        </div>
        <Link href={createHref} className="app-primary-action app-desktop-create">+ {stocktake ? "جرد جديد" : "سند استلام جديد"}</Link>
      </header>

      <section className="operation-list-toolbar" aria-label="البحث والتصفية">
        <label className="operation-search">
          <span aria-hidden="true">⌕</span>
          <input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder={stocktake ? "ابحث برقم عملية الجرد" : "ابحث برقم سند الاستلام"} />
        </label>
        <div className="operation-date-filters">
          <label>من تاريخ<input type="date" value={from} onChange={event => { setFrom(event.target.value); setPage(1); }} /></label>
          <label>إلى تاريخ<input type="date" value={to} onChange={event => { setTo(event.target.value); setPage(1); }} /></label>
        </div>
        <div className="operation-list-shortcuts">
          <Link href={importHref}>استيراد Excel</Link>
          <Link href={archiveHref}>الأرشيف</Link>
        </div>
      </section>

      <div className="operation-list-summary">
        <strong>{totalRows.toLocaleString("ar")} عملية</strong>
        <span>{stocktake ? "سجل الجرد" : "سجل الاستلام"}</span>
      </div>

      {error && <p role="alert" className="app-inline-message">{error}</p>}
      {loading ? (
        <div className="app-empty-state" role="status"><span className="app-loader" /> جارٍ تحميل العمليات…</div>
      ) : entries.length === 0 ? (
        <div className="app-empty-state">
          <span className="app-empty-icon">{stocktake ? "▤" : "⇩"}</span>
          <strong>{search || from || to ? "لا توجد نتائج مطابقة" : stocktake ? "لا توجد عمليات جرد بعد" : "لا توجد سندات استلام بعد"}</strong>
          <p>{search || from || to ? "غيّر كلمات البحث أو نطاق التاريخ." : "ابدأ بإنشاء أول عملية، وستظهر هنا بعد حفظها."}</p>
          {!search && !from && !to && <Link href={createHref} className="app-primary-action">{stocktake ? "إنشاء أول جرد" : "إنشاء أول سند"}</Link>}
        </div>
      ) : (
        <section className="operation-cards" aria-label={title}>
          {entries.map(entry => {
            const lines = stocktake ? entry.stocktake_lines ?? [] : entry.receipt_lines ?? [];
            const number = stocktake ? entry.operation_number ?? "—" : String(entry.receipt_number ?? "—");
            const date = stocktake ? entry.operation_date : entry.receipt_date;
            return (
              <article className="operation-record-card" key={entry.id}>
                <div className="operation-record-top">
                  <div>
                    <span className="operation-record-kind">{stocktake ? "عملية جرد" : "سند استلام"}</span>
                    <h2 dir="ltr">#{number}</h2>
                    <p>{dateLabel(date)}</p>
                  </div>
                  <span className="operation-record-status"><i /> مسجلة</span>
                </div>
                <div className="operation-record-metrics">
                  <div><strong>{lines.length.toLocaleString("ar")}</strong><span>عدد السطور</span></div>
                  {stocktake ? (
                    <div><strong>{new Set(lines.map(line => line.item_name_snapshot)).size.toLocaleString("ar")}</strong><span>أصناف مختلفة</span></div>
                  ) : (
                    <div><strong className="operation-supplier">{entry.supplier_name_snapshot || "غير محدد"}</strong><span>المورد</span></div>
                  )}
                </div>
                {lines.length > 0 && <div className="operation-record-preview">{lines.slice(0, 2).map(line => <span key={line.id}>{line.item_name_snapshot} <b dir="ltr">{String(line.quantity)} {line.unit_name_snapshot ?? ""}</b></span>)}{lines.length > 2 && <small>+ {lines.length - 2} سطور أخرى</small>}</div>}
                <div className="operation-record-actions">
                  <Link href={`/${stocktake ? "stocktakes" : "receipts"}/${entry.id}`}>عرض وتعديل العملية <span aria-hidden="true">←</span></Link>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {totalPages > 1 && <nav className="operation-pagination" aria-label="صفحات النتائج">
        <button type="button" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>السابق</button>
        <span>صفحة {page.toLocaleString("ar")} من {totalPages.toLocaleString("ar")}</span>
        <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage(value => value + 1)}>التالي</button>
      </nav>}

      <Link href={createHref} className="app-floating-create"><span>＋</span>{stocktake ? "أضف جرداً جديداً" : "أضف سند استلام"}</Link>
    </main>
  );
}
