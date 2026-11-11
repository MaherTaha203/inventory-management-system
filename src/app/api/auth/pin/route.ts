import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { changePin } from "@/lib/auth/service";
import { hasSameOrigin, readSessionToken } from "@/lib/auth/http";
import { hasValidSession } from "@/lib/auth/guard";

const schema = z.object({
  currentPin: z.string().regex(/^\d{6}$/),
  newPin: z.string().regex(/^\d{6}$/),
  confirmation: z.string().regex(/^\d{6}$/),
});

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "طلب غير مسموح." }, { status: 403 });
  }

  if (!(await hasValidSession(request))) {
    return NextResponse.json({ error: "انتهت الجلسة. سجّل الدخول مجدداً." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "تأكد من إدخال ثلاثة رموز صحيحة من ستة أرقام." }, { status: 400 });
  }

  const sessionToken = readSessionToken(request);
  if (!sessionToken) {
    return NextResponse.json({ error: "انتهت الجلسة. سجّل الدخول مجدداً." }, { status: 401 });
  }

  if (parsed.data.newPin !== parsed.data.confirmation) {
    return NextResponse.json({ error: "رمز الدخول الجديد وتأكيده غير متطابقين." }, { status: 400 });
  }

  try {
    const changed = await changePin(
      parsed.data.currentPin,
      parsed.data.newPin,
      parsed.data.confirmation,
      sessionToken,
    );
    if (!changed) {
      return NextResponse.json({ error: "تعذر تغيير الرمز. تحقق من الرمز الحالي والجديد." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "تعذر تغيير رمز الدخول حالياً." }, { status: 500 });
  }
}
