import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createOpaqueToken,
  hashOpaqueToken,
  hashPin,
  isOpaqueToken,
  isValidPin,
  verifyPin,
} from "@/lib/auth/pin";

type PinSettingsRow = { pin_hash: string | null };
type ThrottleRow = { blocked_until: string | null };

type AttemptResult = {
  allowed: boolean;
  pin_valid: boolean;
  blocked_until: string | null;
  remaining_attempts: number;
};

type CreateSessionResult = {
  created: boolean;
  reason?: string;
  active_devices?: number;
  session_id?: string;
};

export type LoginResult =
  | { ok: true; sessionToken: string }
  | {
      ok: false;
      reason: "setup_required" | "invalid_pin" | "locked" | "device_limit";
      blockedUntil?: string;
      remainingAttempts?: number;
    };

async function getPinHash(): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("pin_hash")
    .eq("singleton", true)
    .maybeSingle<PinSettingsRow>();

  if (error) throw new Error("تعذر قراءة إعدادات الدخول.");
  return data?.pin_hash ?? null;
}

export async function initializePin(
  pin: string,
  confirmation: string,
  deviceToken: string,
): Promise<LoginResult> {
  if (!isValidPin(pin) || pin !== confirmation || !isOpaqueToken(deviceToken)) {
    return { ok: false, reason: "invalid_pin" };
  }

  const existingHash = await getPinHash();
  if (existingHash) return { ok: false, reason: "setup_required" };

  const pinHash = await hashPin(pin);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("initialize_shared_pin", {
    p_pin_hash: pinHash,
  });

  if (error) throw new Error("تعذر تهيئة رمز الدخول.");
  if (data !== true) return { ok: false, reason: "setup_required" };

  return authenticatePin(pin, deviceToken);
}

export async function authenticatePin(
  pin: string,
  deviceToken: string,
): Promise<LoginResult> {
  if (!isValidPin(pin) || !isOpaqueToken(deviceToken)) {
    return { ok: false, reason: "invalid_pin" };
  }

  const deviceHash = hashOpaqueToken(deviceToken);
  const pinHash = await getPinHash();

  if (!pinHash) return { ok: false, reason: "setup_required" };

  const supabase = createSupabaseAdminClient();
  const { data: throttle, error: throttleError } = await supabase
    .from("login_throttle_state")
    .select("blocked_until")
    .eq("device_token_hash", deviceHash)
    .maybeSingle<ThrottleRow>();

  if (throttleError) throw new Error("تعذر التحقق من حالة محاولات الدخول.");

  if (throttle?.blocked_until) {
    const blockedUntil = new Date(throttle.blocked_until);
    if (blockedUntil.getTime() > Date.now()) {
      return {
        ok: false,
        reason: "locked",
        blockedUntil: throttle.blocked_until,
      };
    }
  }

  const pinIsValid = await verifyPin(pin, pinHash);
  const { data: attemptData, error: attemptError } = await supabase.rpc(
    "record_pin_attempt",
    {
      p_device_token_hash: deviceHash,
      p_pin_valid: pinIsValid,
    },
  );

  if (attemptError) throw new Error("تعذر تسجيل محاولة الدخول.");

  const attempt = attemptData as AttemptResult;
  if (!attempt.allowed) {
    return {
      ok: false,
      reason: "locked",
      blockedUntil: attempt.blocked_until ?? undefined,
      remainingAttempts: 0,
    };
  }

  if (!attempt.pin_valid) {
    return {
      ok: false,
      reason: "invalid_pin",
      remainingAttempts: attempt.remaining_attempts,
    };
  }

  const sessionToken = createOpaqueToken();
  const { data: sessionData, error: sessionError } = await supabase.rpc(
    "create_device_session",
    {
      p_device_token_hash: deviceHash,
      p_session_token_hash: hashOpaqueToken(sessionToken),
    },
  );

  if (sessionError) throw new Error("تعذر إنشاء جلسة الدخول.");

  const session = sessionData as CreateSessionResult;
  if (!session.created) return { ok: false, reason: "device_limit" };

  return { ok: true, sessionToken };
}

export async function validateSession(sessionToken: string): Promise<boolean> {
  if (!isOpaqueToken(sessionToken)) return false;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("validate_device_session", {
    p_session_token_hash: hashOpaqueToken(sessionToken),
  });

  if (error) throw new Error("تعذر التحقق من جلسة الدخول.");
  return data === true;
}

export async function logoutSession(sessionToken: string): Promise<void> {
  if (!isOpaqueToken(sessionToken)) return;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("revoke_device_session", {
    p_session_token_hash: hashOpaqueToken(sessionToken),
  });

  if (error) throw new Error("تعذر إنهاء جلسة الدخول.");
}

export async function changePin(
  currentPin: string,
  newPin: string,
  confirmation: string,
  sessionToken: string,
): Promise<boolean> {
  if (
    !isValidPin(currentPin) ||
    !isValidPin(newPin) ||
    newPin !== confirmation ||
    currentPin === newPin ||
    !isOpaqueToken(sessionToken)
  ) {
    return false;
  }

  const expectedHash = await getPinHash();
  if (!expectedHash || !(await verifyPin(currentPin, expectedHash))) {
    return false;
  }

  const newHash = await hashPin(newPin);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("change_shared_pin", {
    p_expected_pin_hash: expectedHash,
    p_new_pin_hash: newHash,
    p_current_session_hash: hashOpaqueToken(sessionToken),
  });

  if (error) throw new Error("تعذر تغيير رمز الدخول.");
  return data === true;
}
