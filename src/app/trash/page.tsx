"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useInventoryChanges } from "@/lib/realtime/use-inventory-changes";

type TrashType = "stocktake" | "receipt" | "item" | "supplier";

interface TrashEntry {
  entry_type: TrashType;
  entry_id: string;
  display_name: string;
  deleted_at: string;
  purge_at: string;
  daysRemaining: number;
}

interface TrashResponse {
  entries: TrashEntry[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
}

const typeLabels: Record<TrashType, string> = {
  stocktake: "عملية جرد",
  receipt: "سند استلام",
  item: "صنف",
  supplier: "مورد",
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

export default function TrashPage() {
  const [entries, setEntries] = useState<TrashEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [type, setType] = useState<TrashType | "">("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams({ page: String(page) });
    if (type) params.set("type", type);
    if (search.trim()) params.set("q", search.trim());

    try {
      const response = await fetch(`/api/trash?${params.toString()}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as
        | TrashResponse
        | { error?: string };

      if (!response.ok || !("entries" in result)) {
        throw new Error("error" in result ? result.error : "تعذر تحميل السلة.");
      }

      setEntries(result.entries);
      setTotalPages(result.totalPages);
      setTotalRows(result.totalRows);
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "تعذر تحميل سلة المحذوفات.",
      );
    } finally {
      setLoading(false);
    }
  }, [page, search, type]);

  useInventoryChanges(() => { void load(); });

  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);

  async function runAction(
    action: "restore" | "purge" | "empty",
    entry?: TrashEntry,
  ) {
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "empty"
            ? { action }
            : {
                action,
                type: entry?.entry_type,
                id: entry?.entry_id,
              },
        ),
      });
      const result = (await response.json()) as {
        error?: string;
        deleted?: Record<string, number>;
      };

      if (!response.ok) throw new Error(result.error ?? "تعذر تنفيذ العملية.");

      if (action === "empty") {
        setMessage("تم إفراغ سلة المحذوفات.");
      } else if (action === "restore") {
        setMessage("تمت استعادة السجل.");
      } else {
        setMessage("تم حذف السجل نهائياً.");
      }

      await load();
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "تعذر تنفيذ العملية.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-8 sm:px-6">
      <nav className="mb-8">
        <Link href="/" className="text-sm font-semibold text-[var(--accent)]">
          ← الرئيسية
        </Link>
      </nav>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">سلة المحذوفات</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            تُحذف السجلات نهائياً بعد 30 يوماً من تاريخ نقلها إلى السلة.
          </p>
        </div>
        <button
          type="button"
          disabled={busy || totalRows === 0}
          onClick={() => void runAction("empty")}
          className="rounded-xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-700 disabled:opacity-40"
        >
          إفراغ السلة
        </button>
      </header>

      {message && (
        <p role="status" className="mb-4 rounded-xl bg-slate-100 p-3 text-sm">
          {message}
        </p>
      )}

      <section className="mb-5 grid gap-3 rounded-2xl border border-[var(--border)] bg-white p-4 sm:grid-cols-2">
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="بحث في السجلات المحذوفة"
          className="w-full rounded-xl border border-[var(--border)] px-4 py-3"
        />
        <select
          value={type}
          onChange={(event) => {
            setType(event.target.value as TrashType | "");
            setPage(1);
          }}
          className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
        >
          <option value="">كل الأنواع</option>
          <option value="stocktake">عمليات الجرد</option>
          <option value="receipt">سندات الاستلام</option>
          <option value="item">الأصناف</option>
          <option value="supplier">الموردون</option>
        </select>
      </section>

      {loading ? (
        <p role="status" className="rounded-xl border border-[var(--border)] bg-white p-5 text-sm text-[var(--muted)]">
          جارٍ تحميل السلة…
        </p>
      ) : entries.length === 0 ? (
        <p className="rounded-xl border border-[var(--border)] bg-white p-5 text-sm text-[var(--muted)]">
          لا توجد نتائج مطابقة لمعايير البحث.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
          <ul className="divide-y divide-[var(--border)]">
            {entries.map((entry) => (
              <li
                key={`${entry.entry_type}-${entry.entry_id}`}
                className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs">
                      {typeLabels[entry.entry_type]}
                    </span>
                    <span className="text-xs text-[var(--muted)]">
                      متبقٍ {entry.daysRemaining} يوماً
                    </span>
                  </div>
                  <p className="mt-2 break-words text-sm font-semibold">
                    {entry.display_name}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    تاريخ الحذف: {formatDate(entry.deleted_at)} · الحذف النهائي: {formatDate(entry.purge_at)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={busy || entry.daysRemaining <= 0}
                    onClick={() => void runAction("restore", entry)}
                    className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold disabled:opacity-40"
                  >
                    استعادة
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runAction("purge", entry)}
                    className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-40"
                  >
                    حذف نهائياً
                  </button>
                </div>
              </li>
            ))}
          </ul>
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
