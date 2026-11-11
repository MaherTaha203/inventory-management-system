import "server-only";

import type { NextRequest } from "next/server";
import { readSessionToken } from "@/lib/auth/http";
import { validateSession } from "@/lib/auth/service";

export async function hasValidSession(request: NextRequest): Promise<boolean> {
  const token = readSessionToken(request);
  if (!token) return false;
  return validateSession(token);
}
