import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  clearSessionCookie,
  hasSameOrigin,
  readSessionToken,
} from "@/lib/auth/http";
import { changePin, validateSession } from "@/lib/auth/service";

const changePinSchema = z.object({
  currentPin: z.string().regex(/^\d{6}$/),
  newPin: z.string().regex(/^\d{6}$/),
  confirmation: z.string().regex(/^\d{6}$/),
});

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "طلب غير مسموح." }, { status: 403 });
  }

  const sessionToken = readSessionToken(request);
  if (!sessionToken) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }

  try {
    const validSession = await validateSession(sessionToken);
    if (!validSession) {
      const response = NextResponse.json(
        { error: "انتهت الجلسة. أعد تسجيل الدخول." },
        { status: 401 },
      );
      clearSessionCookie(response);
      return response;
    }

    const body = await request.json().catch(() => null);
    const parsed = changePinSchema.safeParse(body);
    if (!parsed.success || parsed.data.newPin !== parsed.data.confirmation) {
      return NextResponse.json({ error: "تحقق من الرمز الجديد وتأكيده." }, { status: 400 });
    }

    const changed = await changePin(
      parsed.data.currentPin,
      parsed.data.newPin,
      parsed.data.confirmation,
      sessionToken,
    );

    if (!changed) {
      return NextResponse.json(
        { error: "تعذر التحقق من الرمز الحالي أو تطبيق التغيير." },
        { status: 403 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "تعذر تغيير رمز الدخول حالياً." },
      { status: 500 },
    );
  }
}
