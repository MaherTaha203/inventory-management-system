"use client";

import Link from "next/link";
import { useState } from "react";
import { useCatalog } from "@/features/catalog/catalog-provider";
import type { CatalogKind } from "@/features/catalog/catalog";

const sections: { kind: CatalogKind; title: string; description: string }[] = [
  { kind: "items", title: "الأصناف", description: "أسماء الأصناف المستخدمة في الجرد والاستلام." },
  { kind: "suppliers", title: "الموردون", description: "أسماء الموردين المستخدمة في سندات الاستلام." },
  { kind: "units", title: "الوحدات", description: "قائمة الوحدات المتاحة للاختيار في كل سطر." },
];

export default function CatalogPage() {
  const { entries, add, rename, setArchived } = useCatalog();
  const [draftNames, setDraftNames] = useState<Record<CatalogKind, string>>({ items: "", suppliers: "", units: "" });
  const [editing, setEditing] = useState<{ kind: CatalogKind; id: string; name: string } | null>(null);
  const [message, setMessage] = useState("");

  function addEntry(kind: CatalogKind) {
    try {
      const entry = add(kind, draftNames[kind]);
      setDraftNames((current) => ({ ...current, [kind]: "" }));
      setMessage(`تمت إضافة «${entry.name}» إلى القائمة المؤقتة.`);
    } catch {
      setMessage("أدخل اسماً صحيحاً قبل الإضافة.");
    }
  }

  function saveRename() {
    if (!editing) return;
    try {
      rename(editing.kind, editing.id, editing.name);
      setEditing(null);
      setMessage("تم تعديل الاسم في القائمة المؤقتة.");
    } catch {
      setMessage("الاسم مطلوب.");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-8 sm:px-6">
      <nav className="mb-8"><Link href="/" className="text-sm font-semibold text-[var(--accent)]">← الرئيسية</Link></nav>
      <header className="mb-6">
        <h1 className="text-2xl font-bold">قوائم النظام</h1>
        <p className="mt-2 text-sm leading-7 text-[var(--muted)]">إدارة أسماء الأصناف والموردين والوحدات واقتراحها أثناء الإدخال.</p>
      </header>
      <div role="alert" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-7 text-amber-950">
        هذه القوائم تعمل مؤقتاً داخل جلسة المتصفح فقط. لا تُحفظ بعد تحديث الصفحة ولا تنتقل إلى جهاز آخر. سنربطها بقاعدة البيانات المركزية بعد توصيل Supabase.
      </div>
      {message && <p role="status" className="mb-4 rounded-lg bg-slate-100 p-3 text-sm">{message}</p>}
      <div className="space-y-5">
        {sections.map((section) => (
          <section key={section.kind} className="rounded-2xl border border-[var(--border)] bg-white p-5">
            <div className="mb-4">
              <h2 className="text-lg font-bold">{section.title}</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">{section.description}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={draftNames[section.kind]} onChange={(event) => setDraftNames((current) => ({ ...current, [section.kind]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") addEntry(section.kind); }} placeholder={`اسم ${section.title.slice(0, -1)} جديد`} className="min-w-0 flex-1 rounded-xl border border-[var(--border)] px-4 py-3" />
              <button onClick={() => addEntry(section.kind)} className="rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white">إضافة</button>
            </div>
            <ul className="mt-4 divide-y divide-[var(--border)]">
              {entries[section.kind].length === 0 && <li className="py-4 text-sm text-[var(--muted)]">لا توجد أسماء مضافة في هذه الجلسة.</li>}
              {entries[section.kind].map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <span className={entry.isArchived ? "text-sm text-[var(--muted)] line-through" : "text-sm font-medium"}>{entry.name}</span>
                    {entry.isArchived && <span className="mr-2 text-xs text-[var(--muted)]">مؤرشف / مخفي من الاقتراحات</span>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditing({ kind: section.kind, id: entry.id, name: entry.name })} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs">تعديل الاسم</button>
                    <button onClick={() => setArchived(section.kind, entry.id, !entry.isArchived)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs">{entry.isArchived ? "إظهار" : "إخفاء"}</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {editing && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="rename-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h2 id="rename-title" className="text-lg font-bold">تعديل الاسم</h2>
            <input autoFocus value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} className="mt-4 w-full rounded-xl border border-[var(--border)] px-4 py-3" />
            <div className="mt-5 flex gap-2">
              <button onClick={saveRename} className="rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white">حفظ</button>
              <button onClick={() => setEditing(null)} className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm">إلغاء</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
