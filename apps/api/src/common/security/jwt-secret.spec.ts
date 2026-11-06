import { describe, expect, it } from "vitest";
import { resolveJwtSecret } from "./jwt-secret";

describe("JWT signing secret configuration", () => {
  it("uses the explicit configured secret during development", () => {
    expect(resolveJwtSecret({ NODE_ENV: "development", JWT_SECRET: "local-test-key" })).toBe("local-test-key");
  });

  it("retains the local-only fallback outside production", () => {
    expect(resolveJwtSecret({ NODE_ENV: "test" })).toBe("dev-secret");
  });

  it("rejects a missing production JWT secret", () => {
    expect(() => resolveJwtSecret({ NODE_ENV: "production" })).toThrow(/JWT_SECRET/);
  });

  it("rejects short and legacy development secrets in production", () => {
    for (const secret of ["dev-secret", "short-value", " ".repeat(33), " a ".repeat(10)]) {
      expect(() => resolveJwtSecret({ NODE_ENV: "production", JWT_SECRET: secret })).toThrow(/JWT_SECRET/);
    }
  });

  it("accepts a strong configured secret in production without changing it", () => {
    const secret = "a-unique-random-production-secret-value-with-sufficient-length";
    expect(resolveJwtSecret({ NODE_ENV: "production", JWT_SECRET: secret })).toBe(secret);
  });
});
