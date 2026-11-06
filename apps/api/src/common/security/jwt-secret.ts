/**
 * Never boot production with the development JWT signing key.
 * Environment checks run before Nest registers its global JWT module.
 */
export function resolveJwtSecret(env: Partial<Pick<NodeJS.ProcessEnv, "NODE_ENV" | "JWT_SECRET">> = process.env): string {
  const configured = env.JWT_SECRET?.trim();

  if (env.NODE_ENV === "production") {
    if (!configured || configured.length < 32 || configured === "dev-secret") {
      throw new Error("JWT_SECRET must be configured with at least 32 characters in production");
    }
    return configured;
  }

  return configured || "dev-secret";
}
