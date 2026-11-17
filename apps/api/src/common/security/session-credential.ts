import { createHmac, timingSafeEqual } from "node:crypto";

// The stored bcrypt hash is salted and changes on reset. Do not expose the hash itself.
export function credentialVersion(passwordHash: string): string {
  return createHmac("sha256", passwordHash).update("ordersawa/login-session/v1").digest("base64url");
}

export function matchesCredentialVersion(version: unknown, passwordHash: string): boolean {
  if (typeof version !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(version)) return false;
  return timingSafeEqual(Buffer.from(version), Buffer.from(credentialVersion(passwordHash)));
}
