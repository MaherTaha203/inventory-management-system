"use client";

import { useMemo, useState } from "react";
import {
  resolveCatalogName,
  searchCatalogNames,
  type CatalogKind,
} from "./catalog";
import { CatalogApiError, useCatalog } from "./catalog-provider";

interface Props {
  kind: CatalogKind;
  value: string;
  selectedId: string | null;
  onChange: (value: string, selectedId: string | null) => void;
  label: string;
  placeholder?: string;
  optional?: boolean;
}

export function CatalogNameInput({
  kind,
  value,
  selectedId,
  onChange,
  label,
  placeholder,
  optional,
}: Props) {
  const { entries, add } = useCatalog();
  const [focused, setFocused] = useState(false);
  const [message, setMessage] = useState("");
  const [remoteMatches, setRemoteMatches] = useState<
    Array<{ id: string; name: string; isArchived: boolean }>
  >([]);

  const suggestions = useMemo(
    () => searchCatalogNames(value, entries[kind]),
    [entries, kind, value],
  );
  const resolution = resolveCatalogName(value, entries[kind]);

  async function addCurrent() {
    if (!value.trim()) return;

    if (resolution.kind === "ambiguous") {
      setRemoteMatches(resolution.matches);
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
      const entry = await add(kind, value);
      onChange(entry.name, entry.id);
      setMessage("تم حفظ الاسم في القائمة المركزية.");
      setRemoteMatches([]);
    } catch (cause) {
      if (cause instanceof CatalogApiError && cause.code === "NAME_MATCHES") {
        setRemoteMatches(cause.matches);
        setMessage("وجدنا اسماً مطابقاً بعد توحيد الكتابة. اختر السجل الموجود.");
        return;
      }

      if (cause instanceof CatalogApiError && cause.code === "TRASH_SIMILAR") {
        const confirmed = window.confirm(
          "يوجد اسم مشابه في سلة المحذوفات. هل تريد إنشاء سجل جديد دون استعادة السجل القديم؟",
        );
        if (!confirmed) {
          setMessage("لم تتم إضافة اسم جديد.");
          return;
        }

        try {
          const entry = await add(kind, value, true);
          onChange(entry.name, entry.id);
          setMessage("تم إنشاء سجل جديد. السجل السابق ما زال في سلة المحذوفات.");
        } catch (retryCause) {
          setMessage(
            retryCause instanceof Error
              ? retryCause.message
              : "تعذر إضافة الاسم.",
          );
        }
        return;
      }

      setMessage(
        cause instanceof Error ? cause.message : "تعذر إضافة الاسم.",
      );
    }
  }

  function choose(id: string) {
    const entry =
      entries[kind].find((candidate) => candidate.id === id) ??
      remoteMatches.find((candidate) => candidate.id === id);
    if (!entry) return;

    onChange(entry.name, entry.id);
    setRemoteMatches([]);
    setMessage("تم اختيار الاسم الموجود.");
    setFocused(false);
  }

  const ambiguous = [
    ...entries[kind].filter((entry) =>
      remoteMatches.some((match) => match.id === entry.id),
    ),
    ...remoteMatches.filter(
      (match) => !entries[kind].some((entry) => entry.id === match.id),
    ),
  ];

  return (
    <div className="relative">
      <label className="block text-sm font-medium">
        {label}
        {optional ? " (اختياري)" : ""}
        <input
          value={value}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          onChange={(event) => {
            onChange(event.target.value, null);
            setMessage("");
            setRemoteMatches([]);
          }}
          placeholder={placeholder}
          autoComplete="off"
          className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
        />
      </label>

      {focused && value.trim() && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-[var(--border)] bg-white p-2 shadow-lg">
          {suggestions.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(entry.id)}
                className="w-full rounded-lg px-3 py-2 text-right text-sm hover:bg-slate-100"
              >
                {entry.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {value.trim() && !selectedId && (
        <button
          type="button"
          onClick={() => void addCurrent()}
          className="mt-2 text-xs font-semibold text-[var(--accent)]"
        >
          {resolution.kind === "new" ? "＋ إضافة هذا الاسم للقائمة" : "اختيار الاسم الموجود"}
        </button>
      )}

      {ambiguous.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="mb-2 text-xs text-amber-900">{message}</p>
          <div className="flex flex-wrap gap-2">
            {ambiguous.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => choose(entry.id)}
                className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs"
              >
                {entry.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {message && ambiguous.length === 0 && (
        <p className="mt-1 text-xs text-[var(--muted)]">{message}</p>
      )}
    </div>
  );
}
