import { signingKey } from "./jwt-key";
import { validateStagingConfig } from "./staging-config";

export function checkoutSigningKey(value: string | undefined): Buffer | undefined {
  if (!value || !/^(?:[a-f0-9]{2}){32,}$/i.test(value)) return undefined;
  const bytes = Buffer.from(value, "hex");
  if (new Set(bytes).size < 8 || /^(.{2,32})\1+$/i.test(value)) return undefined;
  return bytes;
}

function checkDatabaseUrl(name: string, raw: string | undefined): void {
  try {
    const url = new URL(raw ?? "");
    const user = decodeURIComponent(url.username).toLowerCase();
    const database = decodeURIComponent(url.pathname.slice(1)).toLowerCase();
    const password = decodeURIComponent(url.password);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !database ||
        /^(?:pooler_host|direct_host)$/i.test(url.hostname) ||
        /^(?:u51qa|user)$/.test(user) || /^(?:ordersawa_stage[0-9]|ordersawa_qa_|ordersawa_disposable_|u51_qa_)/.test(database) ||
        /^(?:password|changeme|change-me|example|replace-me|postgres)$/i.test(password)) throw new Error();
  } catch {
    throw new Error(name + " must identify a configured PostgreSQL application database");
  }
}

export function validateProductionConfig(env: NodeJS.ProcessEnv): void {
  validateStagingConfig(env);
  if (env.NODE_ENV !== "production") return;
  const jwt = signingKey(env.JWT_SECRET);
  checkDatabaseUrl("DATABASE_URL", env.DATABASE_URL);
  if (env.DIRECT_URL !== undefined) checkDatabaseUrl("DIRECT_URL", env.DIRECT_URL);
  if (env.SEED_DEMO_RESTAURANT === "true" || env.ENABLE_DISPOSABLE_NETWORK_ORDERS === "1")
    throw new Error("Disposable data flags are forbidden in production");
  if (env.ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT === "1") {
    const hmac = checkoutSigningKey(env.PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY);
    if (!hmac || jwt.toLowerCase() === hmac.toString("hex") || hmac.equals(Buffer.from(jwt)))
      throw new Error("Enabled WhatsApp checkout requires an independent random signing key");
  }
}
