import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidSession } from "@/lib/auth/guard";
import { hasSameOrigin } from "@/lib/auth/http";
import { operationDateSchema, parseDisplayDate } from "@/lib/validation/date";
import { quantityTextSchema } from "@/lib/validation/quantity";
import { getPrivilegedDatabaseClient } from "@/lib/supabase/query-client";

const requestSchema = z.object({
  operationId: z.string().uuid().nullable().optional(),
  date: z.string(),
  supplierId: z.string().uuid().nullable().optional(),
  lines: z.array(
    z.object({
      itemId: z.string().uuid(),
      quantity: z.string(),
      unitId: z.string().uuid().nullable().optional(),
    }),
  ).min(1),
});


type ReceiptListRow = {
  id: string;
  receipt_number: number;
  receipt_date: string;
  supplier_name_snapshot: string | null;
  receipt_lines: Array<{
    id: string;
    item_name_snapshot: string;
    quantity: number | string;
    unit_name_snapshot: string | null;
  }>;
};

export async function GET(request: NextRequest) {
  if (!(await hasValidSession(request))) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }

  const page = Math.max(
    1,
    Number.parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10) || 1,
  );
  const pageSize = 20;
  const search = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");

  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return NextResponse.json({ error: "تاريخ البداية غير صحيح." }, { status: 400 });
  }
  if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "تاريخ النهاية غير صحيح." }, { status: 400 });
  }
  if (from && to && from > to) {
    return NextResponse.json({ error: "تاريخ البداية يجب ألا يتجاوز تاريخ النهاية." }, { status: 400 });
  }

  let query = getPrivilegedDatabaseClient()
    .from("receipt_operations")
    .select(
      "id, receipt_number, receipt_date, supplier_name_snapshot, receipt_lines(id, item_name_snapshot, quantity, unit_name_snapshot)",
      { count: "exact" },
    )
    .is("deleted_at", null)
    .order("receipt_date", { ascending: false })
    .order("receipt_number", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (from) query = query.gte("receipt_date", from);
  if (to) query = query.lte("receipt_date", to);
  if (search) query = query.ilike("receipt_number_text", "%" + search.replace(/[\\%_]/g, "\\$&") + "%");

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: "تعذر تحميل أرشيف الاستلام." }, { status: 500 });
  }

  const rows = (data ?? []) as ReceiptListRow[];
  return NextResponse.json({
    entries: rows,
    page,
    pageSize,
    totalRows: count ?? 0,
    totalPages: Math.ceil((count ?? 0) / pageSize),
  });
}

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "طلب غير مسموح." }, { status: 403 });
  }
  if (!(await hasValidSession(request))) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "تأكد من اختيار صنف وكمية لكل سطر." },
      { status: 400 },
    );
  }

  const dateResult = operationDateSchema().safeParse(parsed.data.date);
  const receiptDate = parseDisplayDate(parsed.data.date);
  if (!dateResult.success || !receiptDate) {
    return NextResponse.json(
      { error: dateResult.error?.issues[0]?.message ?? "التاريخ غير صحيح." },
      { status: 400 },
    );
  }

  const lines = [];
  for (const line of parsed.data.lines) {
    const quantity = quantityTextSchema({ allowZero: false }).safeParse(
      line.quantity,
    );
    if (!quantity.success) {
      return NextResponse.json(
        { error: quantity.error.issues[0]?.message ?? "الكمية غير صحيحة." },
        { status: 400 },
      );
    }
    lines.push({
      item_id: line.itemId,
      quantity: line.quantity,
      unit_id: line.unitId ?? null,
    });
  }

  const { data, error } = await getPrivilegedDatabaseClient().rpc(
    "save_receipt",
    {
      p_operation_id: parsed.data.operationId ?? null,
      p_receipt_date: receiptDate,
      p_supplier_id: parsed.data.supplierId ?? null,
      p_lines: lines,
    },
  );

  if (error) {
    const invalid = ["22007", "22023", "23503"].includes(error.code ?? "");
    return NextResponse.json(
      {
        error: invalid
          ? "تعذر حفظ السند بسبب تاريخ أو صنف أو كمية غير صالحة."
          : "تعذر حفظ سند الاستلام. لم يتم اعتماد السجل.",
      },
      { status: invalid ? 400 : 500 },
    );
  }

  return NextResponse.json({ ok: true, id: data }, { status: 200 });
}


export async function DELETE(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "طلب غير مسموح." }, { status: 403 });
  }
  if (!(await hasValidSession(request))) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = z.object({ id: z.string().uuid() }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "رقم السند غير صحيح." }, { status: 400 });
  }

  const { data, error } = await getPrivilegedDatabaseClient().rpc(
    "soft_delete_trash_entry",
    { p_entry_type: "receipt", p_entry_id: parsed.data.id },
  );
  if (error) {
    return NextResponse.json({ error: "تعذر نقل سند الاستلام إلى السلة." }, { status: 500 });
  }
  if (data !== true) {
    return NextResponse.json({ error: "سند الاستلام غير موجود." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
