import "server-only";

import {
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const DERIVED_KEY_BYTES = 64;
const SALT_BYTES = 16;
const MAX_MEMORY_BYTES = 64 * 1024 * 1024;

const PIN_PATTERN = /^\d{6}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function derivePinKey(pin: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      pin,
      salt,
      DERIVED_KEY_BYTES,
      {
        N: SCRYPT_COST,
        r: SCRYPT_BLOCK_SIZE,
        p: SCRYPT_PARALLELIZATION,
        maxmem: MAX_MEMORY_BYTES,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey as Buffer);
      },
    );
  });
}

export function isValidPin(value: string): boolean {
  return PIN_PATTERN.test(value);
}

export async function hashPin(pin: string): Promise<string> {
  if (!isValidPin(pin)) {
    throw new Error("رمز الدخول يجب أن يتكون من ستة أرقام.");
  }

  const salt = randomBytes(SALT_BYTES);
  const derivedKey = await derivePinKey(pin, salt);

  return [
    "scrypt",
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString("hex"),
    derivedKey.toString("hex"),
  ].join("$");
}

export async function verifyPin(
  pin: string,
  storedHash: string,
): Promise<boolean> {
  if (!isValidPin(pin)) return false;

  const parts = storedHash.split("$");
  if (parts.length !== 6) return false;

  const [algorithm, cost, blockSize, parallelization, saltHex, keyHex] = parts;

  if (
    algorithm !== "scrypt" ||
    cost !== String(SCRYPT_COST) ||
    blockSize !== String(SCRYPT_BLOCK_SIZE) ||
    parallelization !== String(SCRYPT_PARALLELIZATION) ||
    !/^[0-9a-f]{32}$/.test(saltHex) ||
    !/^[0-9a-f]{128}$/.test(keyHex)
  ) {
    return false;
  }

  const expected = Buffer.from(keyHex, "hex");
  const actual = await derivePinKey(pin, Buffer.from(saltHex, "hex"));

  return timingSafeEqual(actual, expected);
}

export function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  if (!TOKEN_PATTERN.test(token)) {
    throw new Error("رمز الجلسة أو الجهاز غير صالح.");
  }

  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isOpaqueToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}
