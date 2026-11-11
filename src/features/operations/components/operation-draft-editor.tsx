"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { LocalDraft, OperationKind } from "@/types/domain";
import {
  LocalDraftRepository,
  LocalDraftStorageError,
} from "@/lib/local-drafts/database";
import {
  createOperationDraft,
  type OperationDraftPayload,
  type DraftLine,
} from "@/lib/local-drafts/draft-factory";
import { getTodayISODate } from "@/lib/utils/date";
import { formatISODate } from "@/lib/utils/date";
import { validateOperationDraft } from "@/lib/validation/operation-draft";
import { CatalogNameInput } from "@/features/catalog/catalog-name-input";

type Phase = "loading" | "choice" | "editing" | "error";

const repository = new LocalDraftRepository();

function createEmptyLine(): DraftLine {
  return {
    id: crypto.randomUUID(),
    itemId: null,
    itemName: "",
    quantity: "",
    unitId: null,
    unitName: null,
  };
}

function todayDisplayDate(): string {
  return formatISODate(getTodayISODate());
}

function localTimeLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "وقت غير معروف"
    : date.toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
}

export default function OperationDraftEditor({
  operation,
}: {
  operation: OperationKind;
}) {
  const isReceipt = operation === "receipt";
  const title = isReceipt ? "إدخال سند استلام" : "إدخال عملية جرد";
  const [phase, setPhase] = useState<Phase>("loading");
  const [existing, setExisting] = useState<LocalDraft<OperationDraftPayload> | null>(null);
  const [payload, setPayload] = useState<OperationDraftPayload | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "failed">("saved");
  const [errorMessage, setErrorMessage] = useState("");
  const [validationAttempted, setValidationAttempted] = useState(false);
  const validation = payload ? validateOperationDraft(operation, payload) : null;
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const initialized = useRef(false);

  useEffect(() => {
    let active = true;
    repository
      .get<OperationDraftPayload>(operation)
      .then((draft) => {
        if (!active) return;
        if (draft) {
          setExisting(draft);
          setPhase("choice");
        } else {
          setPhase("choice");
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        setErrorMessage(
          error instanceof LocalDraftStorageError
            ? error.message
            : "تعذر الوصول إلى المسودة المحلية في هذا المتصفح.",
        );
        setPhase("error");
      });
    return () => {
      active = false;
    };
  }, [operation]);

  const beginNew = useCallback(async () => {
    const fresh = createOperationDraft<OperationDraftPayload>(operation, {
      date: todayDisplayDate(),
      lines: [createEmptyLine()],
      ...(isReceipt ? { supplierName: "", supplierId: null } : {}),
    });
    try {
      const result = await repository.create(fresh);
      if (!result.created) {
        setExisting(result.existing);
        setPhase("choice");
        return;
      }
      initialized.current = true;
      setPayload(fresh.payload);
      setSaveState("saved");
      setPhase("editing");
    } catch {
      setErrorMessage("تعذر إنشاء المسودة. تحقق من مساحة التخزين في المتصفح.");
      setPhase("error");
    }
  }, [isReceipt, operation]);

  const resumeExisting = useCallback(() => {
    if (!existing) return;
    initialized.current = true;
    setPayload(existing.payload);
    setSaveState("saved");
    setPhase("editing");
  }, [existing]);

  const deleteExistingAndStart = useCallback(async () => {
    try {
      await repository.delete(operation);
      setExisting(null);
      await beginNew();
    } catch {
      setErrorMessage("تعذر حذف المسودة السابقة. لم يتم إنشاء عملية جديدة.");
      setPhase("error");
    }
  }, [beginNew, operation]);

  useEffect(() => {
    if (phase !== "editing" || !payload || !initialized.current) return;
    const snapshot = createOperationDraft(operation, payload);
    setSaveState("saving");
    writeQueue.current = writeQueue.current
      .catch(() => undefined)
      .then(() => repository.save(snapshot))
      .then(() => setSaveState("saved"))
      .catch(() => setSaveState("failed"));
  }, [operation, payload, phase]);

  function updatePayload(updater: (current: OperationDraftPayload) => OperationDraftPayload) {
    setPayload((current) => (current ? updater(current) : current));
  }

  function updateLine(lineId: string, patch: Partial<DraftLine>) {
    updatePayload((current) => ({
      ...current,
      lines: current.lines.map((line) =>
        line.id === lineId ? { ...line, ...patch } : line,
      ),
    }));
  }

  function addLine() {
    updatePayload((current) => ({ ...current, lines: [...current.lines, createEmptyLine()] }));
  }

  function removeLine(lineId: string) {
    updatePayload((current) => {
      if (current.lines.length <= 1) return current;
      return { ...current, lines: current.lines.filter((line) => line.id !== lineId) };
    });
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-8 sm:px-6">
      <nav className="mb-8 flex items-center justify-between">
        <Link href="/" className="text-sm font-semibold text-[var(--accent)]">← الرئيسية</Link>
        <span className="text-xs text-[var(--muted)]">نظام الجرد والاستلام</span>
      </nav>

      <header className="mb-7">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
          تحفظ التغييرات تلقائياً على هذا الجهاز فقط. لا تُرسل المسودة إلى السجلات المركزية.
        </p>
      </header>

      {phase === "loading" && (
        <p role="status" className="rounded-xl border border-[var(--border)] bg-white p-5 text-sm">
          جارٍ التحقق من وجود مسودة محفوظة…
        </p>
      )}

      {phase === "choice" && (
        <section className="rounded-2xl border border-[var(--border)] bg-white p-5 sm:p-7">
          {existing ? (
            <>
              <h2 className="text-lg font-bold">توجد مسودة سابقة</h2>
              <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                آخر تحديث: {localTimeLabel(existing.updatedAt)}. اختر استكمالها أو حذفها وبدء عملية جديدة.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button onClick={resumeExisting} className="rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white">
                  استكمال المسودة
                </button>
                <button onClick={deleteExistingAndStart} className="rounded-xl border border-[var(--border)] px-5 py-3 text-sm font-semibold">
                  حذف المسودة وبدء جديد
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold">بدء عملية جديدة</h2>
              <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
                ستُنشأ مسودة محلية مستقلة لهذه الوحدة، وتُحفظ التعديلات تلقائياً.
              </p>
              <button onClick={beginNew} className="mt-6 rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white">
                بدء الإدخال
              </button>
            </>
          )}
        </section>
      )}

      {phase === "error" && (
        <section role="alert" className="rounded-2xl border border-red-200 bg-white p-5">
          <p className="text-sm leading-7 text-red-700">{errorMessage}</p>
          <button onClick={() => window.location.reload()} className="mt-4 rounded-xl border border-[var(--border)] px-4 py-2 text-sm">
            إعادة المحاولة
          </button>
        </section>
      )}

      {phase === "editing" && payload && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-white px-4 py-3">
            <span className="text-sm font-medium">حفظ المسودة محلياً</span>
            <span role="status" className="text-xs text-[var(--muted)]">
              {saveState === "saving" ? "جارٍ الحفظ…" : saveState === "failed" ? "تعذر الحفظ — لا تغلق الصفحة" : "تم الحفظ على هذا الجهاز"}
            </span>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-white p-5">
            <label className="block text-sm font-semibold" htmlFor="operation-date">التاريخ (يوم/شهر/سنة)</label>
            <input
              id="operation-date"
              value={payload.date}
              onChange={(event) => updatePayload((current) => ({ ...current, date: event.target.value }))}
              placeholder="DD/MM/YYYY"
              inputMode="numeric"
              className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3 text-left"
              dir="ltr"
              aria-invalid={validationAttempted && Boolean(validation?.errors.date)}
            />
            {validationAttempted && validation?.errors.date && <p className="mt-2 text-xs text-red-700">{validation.errors.date}</p>}
            {isReceipt && (
              <div className="mt-4">
                <CatalogNameInput
                  kind="suppliers"
                  label="اسم المورد"
                  optional
                  value={payload.supplierName ?? ""}
                  selectedId={payload.supplierId ?? null}
                  onChange={(supplierName, supplierId) => updatePayload((current) => ({ ...current, supplierName, supplierId }))}
                />
                {validationAttempted && validation?.errors.supplierName && <p className="mt-2 text-xs text-red-700">{validation.errors.supplierName}</p>}
              </div>
            )}
          </div>

          <div className="space-y-3">
            {payload.lines.map((line, index) => (
              <article key={line.id} className="rounded-2xl border border-[var(--border)] bg-white p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-semibold">الصنف {index + 1}</h2>
                  {payload.lines.length > 1 && (
                    <button onClick={() => removeLine(line.id)} className="text-xs font-semibold text-red-700">
                      حذف السطر
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-3">
                    <CatalogNameInput
                      kind="items"
                      label="اسم الصنف"
                      value={line.itemName}
                      selectedId={line.itemId}
                      placeholder="أدخل اسم الصنف"
                      onChange={(itemName, itemId) => updateLine(line.id, { itemName, itemId })}
                    />
                    {validationAttempted && validation?.errors.lines[line.id]?.itemName && <p className="mt-2 text-xs text-red-700">{validation.errors.lines[line.id].itemName}</p>}
                  </div>
                  <label className="text-sm">
                    الكمية
                    <input
                      value={line.quantity}
                      onChange={(event) => updateLine(line.id, { quantity: event.target.value })}
                      inputMode="decimal"
                      dir="ltr"
                      className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3 text-left"
                      placeholder="0.00"
                      aria-invalid={validationAttempted && Boolean(validation?.errors.lines[line.id]?.quantity)}
                    />
                    {validationAttempted && validation?.errors.lines[line.id]?.quantity && <p className="mt-2 text-xs text-red-700">{validation.errors.lines[line.id].quantity}</p>}
                  </label>
                  <div className="sm:col-span-2">
                    <CatalogNameInput
                      kind="units"
                      label="الوحدة"
                      optional
                      value={line.unitName ?? ""}
                      selectedId={line.unitId}
                      placeholder="مثلاً: قطعة، كرتونة، كغم"
                      onChange={(unitName, unitId) => updateLine(line.id, { unitName: unitName || null, unitId })}
                    />
                  </div>
                </div>
                {validationAttempted && validation?.duplicateLineIds.includes(line.id) && <p className="mt-3 text-xs text-amber-700">تنبيه: هذا الصنف مكرر بنفس الوحدة في العملية. يمكنك الإبقاء عليه إذا كان مقصوداً.</p>}
              </article>
            ))}
          </div>

          <button onClick={addLine} className="w-full rounded-xl border border-dashed border-[var(--accent)] bg-white px-4 py-3 text-sm font-semibold text-[var(--accent)]">
            + إضافة صنف
          </button>
          <button onClick={() => setValidationAttempted(true)} className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white">
            التحقق من البيانات
          </button>
          {validationAttempted && validation && (
            <p role="status" className={`rounded-xl p-4 text-sm leading-6 ${validation.valid ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
              {validation.valid ? "البيانات مستوفية لقواعد الإدخال. لم يتم حفظها كسجل مركزي." : "توجد بيانات تحتاج إلى تصحيح. راجع الحقول الموضحة أعلاه."}
            </p>
          )}
          <p className="rounded-xl bg-slate-100 p-4 text-xs leading-6 text-[var(--muted)]">
            هذه المرحلة تحفظ المسودة على الجهاز فقط. لم يتم بعد ربط زر الحفظ بالسجلات المركزية أو إنشاء رقم عملية.
          </p>
        </section>
      )}
    </main>
  );
}
