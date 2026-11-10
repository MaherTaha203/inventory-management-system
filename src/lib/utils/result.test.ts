import { describe, expect, it } from "vitest";
import { failure, success } from "./result";

describe("Result helpers", () => {
  it("creates a success result", () => {
    expect(success(42)).toEqual({ ok: true, data: 42 });
  });

  it("creates a typed failure result", () => {
    expect(failure("VALIDATION", "بيانات غير صالحة.")).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", message: "بيانات غير صالحة." },
    });
  });
});
