import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidSession } from "@/lib/auth/guard";
import { hasSameOrigin } from "@/lib/auth/http";
import { getPrivilegedDatabaseClient } from "@/lib/supabase/query-client";

const stocktakeColumns = [
  "operation_number",
  "operation_date",
  "item_name",
  "quantity",
  "unit_name",
] as const;
const receiptColumns = [
  "receipt_number",
  "receipt_date",
  "item_name",
  "quantity",
  "unit_name",
  "supplier_name",
] as const;

const preferencesSchema = z.object({
  kind: z.enum(["stocktake", "receipt"]),
  columns: z.array(z.string()).min(1),
});

type PreferencesRow = {
  stocktake_columns: string[];
  receipt_columns: string[];
};

export async function GET(request: NextRequest) {
  if (!(await hasValidSession(request))) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }

  const { data, error } = await getPrivilegedDatabaseClient()
    .from("report_preferences")
    .select("stocktake_columns, receipt_columns")
    .eq("singleton", true)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: "تعذر تحميل إعدادات التقارير." },
      { status: 500 },
    );
  }

  const row = data as PreferencesRow;
  return NextResponse.json({
    stocktake: row.stocktake_columns,
    receipt: row.receipt_columns,
  });
}

export async function PATCH(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "طلب غير مسموح." }, { status: 403 });
  }
  if (!(await hasValidSession(request))) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = preferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "إعدادات الأعمدة غير صحيحة." }, { status: 400 });
  }

  const allowed = parsed.data.kind === "stocktake"
    ? stocktakeColumns
    : receiptColumns;
  const required = parsed.data.kind === "stocktake"
    ? ["operation_number", "operation_date", "item_name", "quantity"]
    : ["receipt_number", "receipt_date", "item_name", "quantity"];

  const selected = [...new Set(parsed.data.columns)];
  if (
    selected.some((column) => !allowed.includes(column as never)) ||
    required.some((column) => !selected.includes(column))
  ) {
    return NextResponse.json(
      { error: "لا يمكن إخفاء الأعمدة الأساسية أو اختيار أعمدة غير معتمدة." },
      { status: 400 },
    );
  }

  const update = parsed.data.kind === "stocktake"
    ? { stocktake_columns: selected, updated_at: new Date().toISOString() }
    : { receipt_columns: selected, updated_at: new Date().toISOString() };

  const { error } = await getPrivilegedDatabaseClient()
    .from("report_preferences")
    .update(update)
    .eq("singleton", true);

  if (error) {
    return NextResponse.json({ error: "تعذر حفظ إعدادات الأعمدة." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, columns: selected });
}
