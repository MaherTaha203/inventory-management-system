"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type HistoryEntry = {
  line_id: string;
  operation_id: string;
  operation_number?: string;
  operation_date?: string;
  receipt_number?: number;
  receipt_date?: string;
  quantity: number | string;
  unit_name: string | null;
  supplier_name?: string | null;
};
type ItemHistoryResponse = {
  item: { id: string; name: string };
  history: { stocktakes: HistoryEntry[]; receipts: HistoryEntry[] };
};

function formatDate(value?: string) {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export default function ItemHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const [result, setResult] = useState<ItemHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void params.then(({ id }) => {
      if (!active) return;
      return fetch(`/api/catalog/items/${id}/history`, { cache: "no-store" })
        .then(async (response) => {
          const data = await response.json() as ItemHistoryResponse | { error?: string };
          if (!response.ok || !("history" in data)) {
            throw new Error("error" in data ? data.error : "تعذر تحميل سجل الصنف.");
          }
          if (active) setResult(data);
        });
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "تعذر تحميل سجل الصنف.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [params]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-8 sm:px-6">
      <nav className="mb-8">
        <Link href="/catalog" className="text-sm font-semibold text-[var(--accent)]">← القوائم</Link>
      </nav>
      <header className="mb-6">
        <p className="text-sm text-[var(--muted)]">سجل الصنف</p>
        <h1 className="mt-2 text-2xl font-bold">{result?.item.name ?? "سجل الصنف"}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">يعرض الجرد والاستلام في قائمتين منفصلتين، دون احتساب أرصدة.</p>
      </header>

      {loading ? <p role="status" className="rounded-xl border border-[var(--border)] bg-white p-5 text-sm">جارٍ تحميل السجل…</p> :
        error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p> :
        result && <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-2xl border border-[var(--border)] bg-white p-4">
            <h2 className="mb-4 text-lg font-bold">عمليات الجرد</h2>
            {result.history.stocktakes.length === 0 ? <p className="text-sm text-[var(--muted)]">لا توجد عمليات جرد لهذا الصنف.</p> :
              <ul className="divide-y divide-[var(--border)]">
                {result.history.stocktakes.map((entry) => <li key={entry.line_id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <Link href={`/stocktakes/${entry.operation_id}`} className="font-semibold text-[var(--accent)]" dir="ltr">{entry.operation_number}</Link>
                    <span className="text-xs text-[var(--muted)]">{formatDate(entry.operation_date)}</span>
                  </div>
                  <p className="mt-2 text-sm">الكمية: <b dir="ltr">{String(entry.quantity)}</b> {entry.unit_name ?? ""}</p>
                </li>)}
              </ul>}
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-white p-4">
            <h2 className="mb-4 text-lg font-bold">سندات الاستلام</h2>
            {result.history.receipts.length === 0 ? <p className="text-sm text-[var(--muted)]">لا توجد سندات استلام لهذا الصنف.</p> :
              <ul className="divide-y divide-[var(--border)]">
                {result.history.receipts.map((entry) => <li key={entry.line_id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <Link href={`/receipts/${entry.operation_id}`} className="font-semibold text-[var(--accent)]" dir="ltr">{entry.receipt_number}</Link>
                    <span className="text-xs text-[var(--muted)]">{formatDate(entry.receipt_date)}</span>
                  </div>
                  <p className="mt-2 text-sm">الكمية: <b dir="ltr">{String(entry.quantity)}</b> {entry.unit_name ?? ""}</p>
                  {entry.supplier_name && <p className="mt-1 text-xs text-[var(--muted)]">المورد: {entry.supplier_name}</p>}
                </li>)}
              </ul>}
          </section>
        </div>}
    </main>
  );
}
