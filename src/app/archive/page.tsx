"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type OperationKind = "stocktake" | "receipt";

interface ArchiveLine {
  id: string;
  item_name_snapshot: string;
  quantity: number | string;
  unit_name_snapshot: string | null;
}

interface ArchiveEntry {
  id: string;
  operation_number?: string;
  receipt_number?: number;
  operation_date?: string;
  receipt_date?: string;
  supplier_name_snapshot?: string | null;
  stocktake_lines?: ArchiveLine[];
  receipt_lines?: ArchiveLine[];
}

interface ArchiveResponse {
  entries: ArchiveEntry[];
  page: number;
  totalPages: number;
  totalRows: number;
}

function formatDate(value: string | undefined): string {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export default function ArchivePage() {
  const [kind, setKind] = useState<OperationKind>("stocktake");
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const task = window.setTimeout(() => {
      const requested = new URLSearchParams(window.location.search).get("kind");
      if (requested === "receipt" || requested === "stocktake") {
        setKind(requested);
      }
    }, 0);
    return () => window.clearTimeout(task);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams({ page: String(page) });
    if (search.trim()) params.set("q", search.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    try {
      const endpoint =
        kind === "stocktake"
          ? "/api/operations/stocktakes"
          : "/api/operations/receipts";
      const response = await fetch(`${endpoint}?${params.toString()}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as
        | ArchiveResponse
        | { error?: string };

      if (!response.ok || !("entries" in result)) {
        throw new Error("error" in result ? result.error : "تعذر تحميل الأرشيف.");
      }

      setEntries(result.entries);
      setTotalPages(result.totalPages);
      setTotalRows(result.totalRows);
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "تعذر تحميل الأرشيف.",
      );
    } finally {
      setLoading(false);
    }
  }, [from, kind, page, search, to]);

  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);

  function changeKind(next: OperationKind) {
    setKind(next);
    setPage(1);
    setSearch("");
    setFrom("");
    setTo("");
    window.history.replaceState(null, "", `/archive?kind=${next}`);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-8 sm:px-6">
      <nav className="mb-8 flex items-center justify-between">
        <Link href="/" className="text-sm font-semibold text-[var(--accent)]">
          ← الرئيسية
        </Link>
        <Link href="/trash" className="text-sm font-semibold text-[var(--accent)]">
          سلة المحذوفات
        </Link>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl font-bold">الأرشيف</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          أحدث العمليات أولاً، مع عرض 20 عملية في كل صفحة.
        </p>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => changeKind("stocktake")}
          aria-pressed={kind === "stocktake"}
          className={kind === "stocktake" ? "rounded-lg bg-white px-4 py-3 text-sm font-semibold shadow-sm" : "rounded-lg px-4 py-3 text-sm text-[var(--muted)]"}
        >
          الجرد
        </button>
        <button
          type="button"
          onClick={() => changeKind("receipt")}
          aria-pressed={kind === "receipt"}
          className={kind === "receipt" ? "rounded-lg bg-white px-4 py-3 text-sm font-semibold shadow-sm" : "rounded-lg px-4 py-3 text-sm text-[var(--muted)]"}
        >
          الاستلام
        </button>
      </div>

      <section className="mb-5 grid gap-3 rounded-2xl border border-[var(--border)] bg-white p-4 sm:grid-cols-3">
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder={kind === "stocktake" ? "بحث برقم الجرد" : "بحث برقم السند"}
          className="rounded-xl border border-[var(--border)] px-4 py-3"
        />
        <label className="text-xs text-[var(--muted)]">
          من تاريخ
          <input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
            className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-3 text-sm text-[var(--foreground)]"
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          إلى تاريخ
          <input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setPage(1);
            }}
            className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-3 text-sm text-[var(--foreground)]"
          />
        </label>
      </section>

      {message && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">
          {message}
        </p>
      )}

      <p className="mb-3 text-xs text-[var(--muted)]">
        إجمالي النتائج: {totalRows}
      </p>

      {loading ? (
        <p role="status" className="rounded-xl border border-[var(--border)] bg-white p-5 text-sm text-[var(--muted)]">
          جارٍ تحميل الأرشيف…
        </p>
      ) : entries.length === 0 ? (
        <p className="rounded-xl border border-[var(--border)] bg-white p-5 text-sm text-[var(--muted)]">
          لا توجد نتائج مطابقة لمعايير البحث.
        </p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const lines =
              kind === "stocktake"
                ? entry.stocktake_lines ?? []
                : entry.receipt_lines ?? [];
            const number =
              kind === "stocktake"
                ? entry.operation_number
                : String(entry.receipt_number ?? "");
            const date =
              kind === "stocktake"
                ? entry.operation_date
                : entry.receipt_date;

            return (
              <article
                key={entry.id}
                className="rounded-2xl border border-[var(--border)] bg-white p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold" dir="ltr">
                      {number}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      التاريخ: {formatDate(date)}
                    </p>
                    {kind === "receipt" && entry.supplier_name_snapshot && (
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        المورد: {entry.supplier_name_snapshot}
                      </p>
                    )}
                  </div>
                  <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs">
                    {lines.length} سطور
                  </span>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[360px] text-right text-sm">
                    <thead className="text-xs text-[var(--muted)]">
                      <tr>
                        <th className="pb-2 font-medium">الصنف</th>
                        <th className="pb-2 font-medium">الكمية</th>
                        <th className="pb-2 font-medium">الوحدة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {lines.map((line) => (
                        <tr key={line.id}>
                          <td className="py-2">{line.item_name_snapshot}</td>
                          <td className="py-2" dir="ltr">{String(line.quantity)}</td>
                          <td className="py-2">{line.unit_name_snapshot ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((current) => current - 1)}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-40"
          >
            السابق
          </button>
          <span className="text-xs text-[var(--muted)]">
            صفحة {page} من {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((current) => current + 1)}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-40"
          >
            التالي
          </button>
        </div>
      )}
    </main>
  );
}
