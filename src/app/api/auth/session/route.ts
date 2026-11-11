import { NextRequest, NextResponse } from "next/server";
import {
  clearSessionCookie,
  readSessionToken,
} from "@/lib/auth/http";
import { validateSession } from "@/lib/auth/service";

export async function GET(request: NextRequest) {
  const sessionToken = readSessionToken(request);
  if (!sessionToken) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  try {
    const valid = await validateSession(sessionToken);
    if (!valid) {
      const response = NextResponse.json(
        { authenticated: false },
        { status: 401 },
      );
      clearSessionCookie(response);
      return response;
    }

    return NextResponse.json({ authenticated: true });
  } catch {
    return NextResponse.json(
      { error: "تعذر التحقق من الجلسة." },
      { status: 500 },
    );
  }
}
