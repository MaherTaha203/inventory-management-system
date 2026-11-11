import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidSession } from "@/lib/auth/guard";
import { getPrivilegedDatabaseClient } from "@/lib/supabase/query-client";

const idSchema = z.string().uuid();

type RouteContext = {
  params: Promise<{ kind: string; id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  if (!(await hasValidSession(request))) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }

  const params = await context.params;
  const id = idSchema.safeParse(params.id);
  if (!id.success) {
    return NextResponse.json({ error: "معرّف العملية غير صحيح." }, { status: 400 });
  }

  const kind = params.kind;
  const isStocktake = kind === "stocktakes";
  if (!isStocktake && kind !== "receipts") {
    return NextResponse.json({ error: "نوع العملية غير صحيح." }, { status: 400 });
  }

  const table = isStocktake ? "stocktake_operations" : "receipt_operations";
  const columns = isStocktake
    ? "id, operation_number, operation_date, stocktake_lines(id, item_id, item_name_snapshot, quantity, unit_id, unit_name_snapshot, line_position)"
    : "id, receipt_number, receipt_date, supplier_id, supplier_name_snapshot, receipt_lines(id, item_id, item_name_snapshot, quantity, unit_id, unit_name_snapshot)";

  const { data, error } = await getPrivilegedDatabaseClient()
    .from(table)
    .select(columns)
    .eq("id", id.data)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "تعذر تحميل العملية." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "العملية غير موجودة." }, { status: 404 });
  }

  return NextResponse.json({ entry: data });
}
