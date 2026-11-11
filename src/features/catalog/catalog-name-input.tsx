"use client";

import { useMemo, useState } from "react";
import { resolveCatalogName, searchCatalogNames, type CatalogKind } from "./catalog";
import { useCatalog } from "./catalog-provider";

interface Props {
  kind: CatalogKind;
  value: string;
  selectedId: string | null;
  onChange: (value: string, selectedId: string | null) => void;
  label: string;
  placeholder?: string;
  optional?: boolean;
}

export function CatalogNameInput({ kind, value, selectedId, onChange, label, placeholder, optional }: Props) {
  const { entries, add } = useCatalog();
  const [focused, setFocused] = useState(false);
  const [message, setMessage] = useState("");
  const [ambiguousIds, setAmbiguousIds] = useState<string[]>([]);
  const suggestions = useMemo(() => searchCatalogNames(value, entries[kind]), [entries, kind, value]);
  const resolution = resolveCatalogName(value, entries[kind]);

  function addCurrent() {
    if (!value.trim()) return;
    if (resolution.kind === "ambiguous") {
      setAmbiguousIds(resolution.matches.map((entry) => entry.id));
      setMessage("توجد أسماء متطابقة بعد توحيد الكتابة. اختر السجل المقصود.");
      return;
    }
    if (resolution.kind === "matched") {
      const match = resolution.matches[0];
      onChange(match.name, match.id);
      setMessage("تم اختيار الاسم الموجود.");
      return;
    }
    try {
      const entry = add(kind, value);
      onChange(entry.name, entry.id);
      setMessage("أُضيف الاسم إلى القائمة المؤقتة لهذه الجلسة.");
    } catch {
      setMessage("الاسم مطلوب.");
    }
  }

  function choose(id: string) {
    const entry = entries[kind].find((candidate) => candidate.id === id);
    if (!entry) return;
    onChange(entry.name, entry.id);
    setAmbiguousIds([]);
    setMessage("تم اختيار الاسم.");
    setFocused(false);
  }

  const ambiguous = entries[kind].filter((entry) => ambiguousIds.includes(entry.id));
  return (
    <div className="relative">
      <label className="block text-sm font-medium">
        {label}{optional ? " (اختياري)" : ""}
        <input
          value={value}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          onChange={(event) => { onChange(event.target.value, null); setMessage(""); setAmbiguousIds([]); }}
          placeholder={placeholder}
          autoComplete="off"
          className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
        />
      </label>
      {focused && value.trim() && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-[var(--border)] bg-white p-2 shadow-lg">
          {suggestions.map((entry) => (
            <li key={entry.id}>
              <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(entry.id)} className="w-full rounded-lg px-3 py-2 text-right text-sm hover:bg-slate-100">
                {entry.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {value.trim() && !selectedId && (
        <button type="button" onClick={addCurrent} className="mt-2 text-xs font-semibold text-[var(--accent)]">
          {resolution.kind === "new" ? "＋ إضافة هذا الاسم للقائمة" : "اختيار الاسم الموجود"}
        </button>
      )}
      {ambiguous.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="mb-2 text-xs text-amber-900">{message}</p>
          <div className="flex flex-wrap gap-2">
            {ambiguous.map((entry) => <button key={entry.id} type="button" onClick={() => choose(entry.id)} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs">{entry.name}</button>)}
          </div>
        </div>
      )}
      {message && ambiguous.length === 0 && <p className="mt-1 text-xs text-[var(--muted)]">{message}</p>}
    </div>
  );
}
