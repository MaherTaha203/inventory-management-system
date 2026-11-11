import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidSession } from "@/lib/auth/guard";
import { hasSameOrigin } from "@/lib/auth/http";
import { operationDateSchema, parseDisplayDate } from "@/lib/validation/date";
import { quantityTextSchema } from "@/lib/validation/quantity";
import { getPrivilegedDatabaseClient } from "@/lib/supabase/query-client";
import { publishInventoryChange } from "@/lib/realtime/publish-inventory-change";

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


function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export async function GET(request: NextRequest) {
  if (!(await hasValidSession(request))) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }

  const page = Math.min(
    1_000_000,
    Math.max(1, Number.parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10) || 1),
  );
  const search = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");

  if (from && !isValidIsoDate(from)) {
    return NextResponse.json({ error: "تاريخ البداية غير صحيح." }, { status: 400 });
  }
  if (to && !isValidIsoDate(to)) {
    return NextResponse.json({ error: "تاريخ النهاية غير صحيح." }, { status: 400 });
  }
  if (from && to && from > to) {
    return NextResponse.json(
      { error: "تاريخ البداية يجب ألا يتجاوز تاريخ النهاية." },
      { status: 400 },
    );
  }

  const { data, error } = await getPrivilegedDatabaseClient().rpc("search_stocktakes", {
    p_query: search || null,
    p_from: from || null,
    p_to: to || null,
    p_page: page,
    p_page_size: 20,
  });

  if (error) {
    const invalid = error.code === "22023";
    return NextResponse.json(
      { error: invalid ? "معايير البحث أو الترقيم غير صحيحة." : "تعذر تحميل الأرشيف." },
      { status: invalid ? 400 : 500 },
    );
  }

  return NextResponse.json(data);
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

  await publishInventoryChange();
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
    return NextResponse.json({ error: "رقم العملية غير صحيح." }, { status: 400 });
  }

  const { data, error } = await getPrivilegedDatabaseClient().rpc(
    "soft_delete_trash_entry",
    { p_entry_type: "stocktake", p_entry_id: parsed.data.id },
  );
  if (error) {
    return NextResponse.json({ error: "تعذر نقل عملية الجرد إلى السلة." }, { status: 500 });
  }
  if (data !== true) {
    return NextResponse.json({ error: "عملية الجرد غير موجودة." }, { status: 404 });
  }

  await publishInventoryChange();
  return NextResponse.json({ ok: true });
}
