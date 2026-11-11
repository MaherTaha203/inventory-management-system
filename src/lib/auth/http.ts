import "server-only";

import { timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { isOpaqueToken } from "@/lib/auth/pin";

export const SESSION_COOKIE_NAME = "inventory_session";

export function readSessionToken(request: NextRequest): string | null {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return token && isOpaqueToken(token) ? token : null;
}

export function setSessionCookie(
  response: NextResponse,
  sessionToken: string,
): void {
  response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

export function hasSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === request.nextUrl.origin;
}

export function verifyInitialSetupSecret(provided: string): boolean {
  const expected = process.env.INITIAL_SETUP_SECRET;
  if (!expected || expected.length < 32 || provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
