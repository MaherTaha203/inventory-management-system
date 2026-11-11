import { z } from "zod";

/**
 * Validates the user's decimal text before converting it to a number.
 * Allows zero only when the caller explicitly requests it.
 */
export function quantityTextSchema(options: { allowZero: boolean }) {
  return z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d{1,2})?$/, "أدخل رقماً صحيحاً أو عشرياً بمنزلتين كحد أقصى.")
    .refine((value) => {
      const amount = Number(value);
      return Number.isFinite(amount) && (options.allowZero ? amount >= 0 : amount > 0);
    }, options.allowZero ? "الكمية لا يمكن أن تكون سالبة." : "الكمية يجب أن تكون أكبر من صفر.");
}
