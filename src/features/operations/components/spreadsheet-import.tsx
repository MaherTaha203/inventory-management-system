"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { useCatalog, CatalogApiError } from "@/features/catalog/catalog-provider";
import { normalizeNameForMatch } from "@/lib/validation/name";
import { quantityTextSchema } from "@/lib/validation/quantity";
import { LocalDraftRepository } from "@/lib/local-drafts/database";
import { createOperationDraft, type DraftLine, type OperationDraftPayload } from "@/lib/local-drafts/draft-factory";
import type { OperationKind } from "@/types/domain";
import { getTodayISODate, formatISODate } from "@/lib/utils/date";

type ImportRow = {
  id: string;
  rowNumber: number;
  itemName: string;
  quantity: string;
  unitName: string;
  checked: boolean;
  error: string;
  duplicate: boolean;
};

const repository = new LocalDraftRepository();

function detectColumn(headers: string[], kind: "item" | "quantity" | "unit") {
  const patterns = {
    item: /صنف|المادة|اسم الصنف|item|product|name/i,
    quantity: /كمية|الكمية|quantity|qty/i,
    unit: /وحدة|الوحدة|unit|uom/i,
  };
  return headers.findIndex((header) => patterns[kind].test(header.trim()));
}
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "number" ? String(value) : String(value).trim();
}

export default function SpreadsheetImport({ operation }: { operation: OperationKind }) {
  const router = useRouter();
  const { entries, add } = useCatalog();
  const [fileName, setFileName] = useState("");
  const [matrix, setMatrix] = useState<unknown[][]>([]);
  const [headerRow, setHeaderRow] = useState(0);
  const [headers, setHeaders] = useState<string[]>([]);
  const [itemColumn, setItemColumn] = useState(-1);
  const [quantityColumn, setQuantityColumn] = useState(-1);
  const [unitColumn, setUnitColumn] = useState(-1);
  const [blankQuantityMode, setBlankQuantityMode] = useState<"exclude" | "zero">("exclude");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [stage, setStage] = useState<"select" | "map" | "preview">("select");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const dataRows = useMemo(() => matrix.slice(headerRow + 1), [headerRow, matrix]);

  async function readFile(file: File) {
    setMessage("");
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setMessage("يسمح فقط بملفات Excel بصيغة .xlsx أو .xls.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessage("حجم الملف يتجاوز الحد المسموح (10 ميغابايت).");
      return;
    }

    setBusy(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), {
        type: "array",
        cellFormula: true,
        cellDates: false,
      });
      if (workbook.SheetNames.length !== 1) {
        throw new Error("يجب أن يحتوي الملف على ورقة عمل واحدة فقط.");
      }
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const parsed = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: true,
        defval: "",
        blankrows: true,
      });
      if (parsed.length < 2) throw new Error("الملف لا يحتوي على صفوف بيانات كافية.");
      if (parsed.length > 5001) throw new Error("الملف يتجاوز 5000 صف بيانات.");

      const detected = parsed.slice(0, 20).findIndex((row) => {
        const values = row.map(cellText);
        return detectColumn(values, "item") >= 0 && detectColumn(values, "quantity") >= 0;
      });
      const chosenHeader = detected >= 0 ? detected : 0;
      const nextHeaders = (parsed[chosenHeader] ?? []).map((value, index) => cellText(value) || ("عمود " + (index + 1)));
      setFileName(file.name);
      setMatrix(parsed);
      setHeaderRow(chosenHeader);
      setHeaders(nextHeaders);
      setItemColumn(detectColumn(nextHeaders, "item"));
      setQuantityColumn(detectColumn(nextHeaders, "quantity"));
      setUnitColumn(detectColumn(nextHeaders, "unit"));
      setStage("map");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "تعذر قراءة الملف.");
    } finally {
      setBusy(false);
    }
  }

  function buildPreview() {
    if (itemColumn < 0 || quantityColumn < 0 || itemColumn === quantityColumn || itemColumn === unitColumn || quantityColumn === unitColumn) {
      setMessage("اختر عمود الصنف وعمود الكمية، ويمكن اختيار عمود وحدة مختلف.");
      return;
    }

    const parsedRows: ImportRow[] = dataRows.map((row, index) => {
      const itemName = cellText(row[itemColumn]);
      let quantity = cellText(row[quantityColumn]);
      const unitName = unitColumn >= 0 ? cellText(row[unitColumn]) : "";
      let error = "";

      if (!itemName) error = "اسم الصنف فارغ.";
      if (!quantity && operation === "stocktake" && blankQuantityMode === "zero") quantity = "0";
      if (!quantity) error = error || (operation === "stocktake" ? "الكمية فارغة." : "كمية الاستلام فارغة.");
      if (quantity && !quantityTextSchema({ allowZero: operation === "stocktake" }).safeParse(quantity).success) {
        error = error || "الكمية غير صالحة؛ السالب والفاصلة العشرية والمنازل الزائدة غير مسموحة.";
      }

      return {
        id: crypto.randomUUID(),
        rowNumber: headerRow + index + 2,
        itemName,
        quantity,
        unitName,
        checked: !error,
        error,
        duplicate: false,
      };
    }).filter((row) => row.itemName || row.quantity || row.unitName);

    const seen = new Map<string, number>();
    parsedRows.forEach((row, index) => {
      if (row.error) return;
      const key = normalizeNameForMatch(row.itemName) + "|" + row.unitName;
      const prior = seen.get(key);
      if (prior !== undefined) {
        row.duplicate = true;
        parsedRows[prior].duplicate = true;
      } else {
        seen.set(key, index);
      }
    });

    setRows(parsedRows);
    setMessage("");
    setStage("preview");
  }

  function toggleRow(id: string, checked: boolean) {
    setRows((current) => current.map((row) => row.id === id && !row.error ? { ...row, checked } : row));
  }

  async function addToOperation() {
    const selected = rows.filter((row) => row.checked && !row.error);
    if (selected.length === 0) {
      setMessage("حدد صفاً صالحاً واحداً على الأقل.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const existingDraft = await repository.get(operation);
      if (existingDraft) {
        throw new Error("توجد مسودة سابقة لهذه الوحدة. افتح صفحة الإدخال واختر استكمالها أو حذفها قبل الاستيراد.");
      }

      const draftLines: DraftLine[] = [];
      const itemCache = new Map<string, { id: string; name: string }>();
      const unitCache = new Map<string, { id: string; name: string }>();

      for (const row of selected) {
        const normalized = normalizeNameForMatch(row.itemName);
        let item = itemCache.get(normalized);
        if (!item) {
          const matches = entries.items.filter((entry) => !entry.isArchived && normalizeNameForMatch(entry.name) === normalized);
          if (matches.length > 1) throw new Error("اسم الصنف «" + row.itemName + "» يطابق أكثر من سجل. عالج الاسم من قائمة الأصناف أولاً.");
          if (matches.length === 1) {
            item = matches[0];
          } else {
            try {
              item = await add("items", row.itemName);
            } catch (cause) {
              if (cause instanceof CatalogApiError && cause.code === "NAME_MATCHES" && cause.matches.length === 1) {
                item = cause.matches[0];
              } else if (cause instanceof CatalogApiError && cause.code === "TRASH_SIMILAR") {
                const confirmed = window.confirm(
                  "يوجد اسم مشابه في سلة المحذوفات («" + row.itemName + "»). هل تريد إنشاء صنف جديد دون استعادة السجل القديم؟",
                );
                if (!confirmed) throw new Error("أُلغي استيراد الصفوف؛ لم تتم إضافة الصنف المشابه.");
                item = await add("items", row.itemName, true);
              } else {
                throw cause;
              }
            }
          }
          itemCache.set(normalized, item);
        }

        let unit: { id: string; name: string } | null = null;
        if (row.unitName) {
          unit = unitCache.get(row.unitName) ?? null;
          if (!unit) {
            const match = entries.units.find((entry) => entry.name === row.unitName);
            if (match?.isArchived) throw new Error("الوحدة «" + row.unitName + "» مخفية من الاقتراحات. أظهرها من قائمة الوحدات أولاً.");
            if (match) unit = match;
            else unit = await add("units", row.unitName);
            unitCache.set(row.unitName, unit);
          }
        }

        draftLines.push({
          id: crypto.randomUUID(),
          itemId: item.id,
          itemName: item.name,
          quantity: row.quantity,
          unitId: unit?.id ?? null,
          unitName: unit?.name ?? null,
        });
      }

      const payload: OperationDraftPayload = {
        date: formatISODate(getTodayISODate()),
        lines: draftLines,
        ...(operation === "receipt" ? { supplierName: "", supplierId: null } : {}),
      };
      const result = await repository.create(createOperationDraft(operation, payload));
      if (!result.created) {
        throw new Error("ظهرت مسودة جديدة أثناء الاستيراد. لم يتم استبدالها.");
      }
      router.push(operation === "stocktake" ? "/stocktakes" : "/receipts");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "تعذر إضافة الصفوف إلى العملية.");
    } finally {
      setBusy(false);
    }
  }

  const title = operation === "stocktake" ? "استيراد ملف إلى عملية الجرد" : "استيراد ملف إلى سند الاستلام";
  const validCount = rows.filter((row) => !row.error).length;
  const selectedCount = rows.filter((row) => row.checked && !row.error).length;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-8 sm:px-6">
      <nav className="mb-8">
        <Link href={operation === "stocktake" ? "/stocktakes" : "/receipts"} className="text-sm font-semibold text-[var(--accent)]">← العودة للإدخال</Link>
      </nav>
      <header className="mb-6">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-sm leading-7 text-[var(--muted)]">يدعم ملفات Excel ذات الورقة الواحدة. تتم المعاينة والتحقق أولاً، ولا تُضاف البيانات إلا بعد الضغط على «إضافة إلى العملية».</p>
      </header>

      {message && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm leading-6 text-red-800">{message}</p>}

      {stage === "select" && <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <label className="block text-sm font-semibold">
          اختر ملف Excel (.xlsx أو .xls)
          <input type="file" accept=".xlsx,.xls" disabled={busy} onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readFile(file);
          }} className="mt-3 block w-full rounded-xl border border-[var(--border)] p-3 text-sm" />
        </label>
        {busy && <p role="status" className="mt-4 text-sm text-[var(--muted)]">جارٍ قراءة الملف…</p>}
      </section>}

      {stage === "map" && <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-white p-5">
        <p className="text-sm font-semibold">الملف: {fileName}</p>
        <label className="block text-sm">صف العناوين
          <select value={headerRow} onChange={(event) => {
            const index = Number(event.target.value);
            const nextHeaders = (matrix[index] ?? []).map((value, column) => cellText(value) || ("عمود " + (column + 1)));
            setHeaderRow(index);
            setHeaders(nextHeaders);
            setItemColumn(detectColumn(nextHeaders, "item"));
            setQuantityColumn(detectColumn(nextHeaders, "quantity"));
            setUnitColumn(detectColumn(nextHeaders, "unit"));
          }} className="mt-2 w-full rounded-xl border border-[var(--border)] p-3">
            {matrix.slice(0, 20).map((row, index) => <option key={index} value={index}>الصف {index + 1}: {row.map(cellText).filter(Boolean).slice(0, 4).join(" · ")}</option>)}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">عمود الصنف
            <select value={itemColumn} onChange={(event) => setItemColumn(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-[var(--border)] p-3">
              <option value={-1}>اختر العمود</option>
              {headers.map((header, index) => <option key={index} value={index}>{header}</option>)}
            </select>
          </label>
          <label className="text-sm">عمود الكمية
            <select value={quantityColumn} onChange={(event) => setQuantityColumn(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-[var(--border)] p-3">
              <option value={-1}>اختر العمود</option>
              {headers.map((header, index) => <option key={index} value={index}>{header}</option>)}
            </select>
          </label>
          <label className="text-sm">عمود الوحدة (اختياري)
            <select value={unitColumn} onChange={(event) => setUnitColumn(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-[var(--border)] p-3">
              <option value={-1}>بدون وحدة</option>
              {headers.map((header, index) => <option key={index} value={index}>{header}</option>)}
            </select>
          </label>
        </div>
        {operation === "stocktake" && <fieldset className="rounded-xl bg-slate-50 p-3">
          <legend className="text-sm font-semibold">الكمية الفارغة في الجرد</legend>
          <label className="ml-4 inline-flex items-center gap-2 text-sm"><input type="radio" checked={blankQuantityMode === "exclude"} onChange={() => setBlankQuantityMode("exclude")} />استبعاد الصف</label>
          <label className="inline-flex items-center gap-2 text-sm"><input type="radio" checked={blankQuantityMode === "zero"} onChange={() => setBlankQuantityMode("zero")} />اعتبارها صفراً</label>
        </fieldset>}
        <div className="flex gap-2">
          <button type="button" onClick={buildPreview} className="rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white">معاينة الصفوف</button>
          <button type="button" onClick={() => { setStage("select"); setMatrix([]); }} className="rounded-xl border border-[var(--border)] px-5 py-3 text-sm">إلغاء</button>
        </div>
      </section>}

      {stage === "preview" && <section className="space-y-4">
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="rounded-lg bg-slate-100 px-3 py-2">الصفوف الصالحة: {validCount}</span>
          <span className="rounded-lg bg-slate-100 px-3 py-2">المحدد للإضافة: {selectedCount}</span>
          <span className="rounded-lg bg-red-50 px-3 py-2 text-red-700">المستبعدة: {rows.filter((row) => Boolean(row.error)).length}</span>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
          <table className="w-full min-w-[640px] text-right text-sm">
            <thead className="bg-slate-50 text-xs"><tr><th className="p-3">إضافة</th><th className="p-3">رقم الصف</th><th className="p-3">الصنف</th><th className="p-3">الكمية</th><th className="p-3">الوحدة</th><th className="p-3">الحالة</th></tr></thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((row) => <tr key={row.id} className={row.error ? "bg-red-50/50" : ""}>
                <td className="p-3"><input type="checkbox" checked={row.checked} disabled={Boolean(row.error)} onChange={(event) => toggleRow(row.id, event.target.checked)} /></td>
                <td className="p-3" dir="ltr">{row.rowNumber}</td><td className="p-3">{row.itemName || "—"}</td><td className="p-3" dir="ltr">{row.quantity || "—"}</td><td className="p-3">{row.unitName || "—"}</td>
                <td className="p-3 text-xs">{row.error ? row.error : row.duplicate ? "تكرار محتمل — سيبقى كسطر مستقل" : "صالح"}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy || selectedCount === 0} onClick={() => void addToOperation()} className="rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "جارٍ الإضافة…" : "إضافة إلى العملية"}</button>
          <button type="button" disabled={busy} onClick={() => setStage("map")} className="rounded-xl border border-[var(--border)] px-5 py-3 text-sm">العودة لتعديل الأعمدة</button>
        </div>
      </section>}
    </main>
  );
}
