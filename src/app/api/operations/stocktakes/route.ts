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
  lines: z.array(
    z.object({
      itemId: z.string().uuid(),
      quantity: z.string(),
      unitId: z.string().uuid().nullable().optional(),
    }),
  ).min(1),
});

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
  const operationDate = parseDisplayDate(parsed.data.date);
  if (!dateResult.success || !operationDate) {
    return NextResponse.json(
      { error: dateResult.error?.issues[0]?.message ?? "التاريخ غير صحيح." },
      { status: 400 },
    );
  }

  const lines = [];
  for (const line of parsed.data.lines) {
    const quantity = quantityTextSchema({ allowZero: true }).safeParse(
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
    "save_stocktake",
    {
      p_operation_id: parsed.data.operationId ?? null,
      p_operation_date: operationDate,
      p_lines: lines,
    },
  );

  if (error) {
    const invalid = ["22007", "22023", "23503"].includes(error.code ?? "");
    return NextResponse.json(
      {
        error: invalid
          ? "تعذر حفظ العملية بسبب تاريخ أو صنف أو كمية غير صالحة."
          : "تعذر حفظ عملية الجرد. لم يتم اعتماد السجل.",
      },
      { status: invalid ? 400 : 500 },
    );
  }

  return NextResponse.json({ ok: true, id: data }, { status: 200 });
}
