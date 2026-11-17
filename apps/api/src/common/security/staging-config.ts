// Staging is an explicit deployment target, never inferred from NODE_ENV.
export function validateStagingConfig(env: NodeJS.ProcessEnv): void {
  if (env.ORDERSAWA_ENV !== "staging") return;
  if (env.NODE_ENV !== "production") throw new Error("Staging requires a production build");
  const database = env.STAGING_DB_NAME;
  const host = env.STAGING_DB_HOST;
  const port = env.STAGING_DB_PORT;
  if (!database || !/^ordersawa_staging(?:_[a-z0-9]+)*$/.test(database) || !host || !/^\d+$/.test(port ?? ""))
    throw new Error("Explicit staging database identity is required");
  for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
    try {
      const url = new URL(env[key] ?? "");
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== host ||
          (url.port || '5432') !== port || decodeURIComponent(url.pathname.slice(1)) !== database ||
          !url.username || !url.password || [...url.searchParams.keys()].some(k =>
            !['schema','sslmode','connection_limit','pool_timeout','connect_timeout'].includes(k))) throw new Error();
    } catch { throw new Error(key + " does not match the explicit staging database identity"); }
  }
  const web = new URL(env.WEB_ORIGIN ?? "https://invalid.invalid");
  const api = new URL(env.API_ORIGIN ?? "https://invalid.invalid");
  if (web.protocol !== 'https:' || api.protocol !== 'https:' || web.hostname.endsWith('.invalid') ||
      web.hostname === 'ordersawa.com' || web.hostname === 'rydtest.ordersawa.com' ||
      api.origin !== web.origin || api.pathname !== '/api' || env.NEXT_PUBLIC_API_URL !== '/api' ||
      env.CORS_ORIGINS !== web.origin || env.NEXT_PUBLIC_WEB_URL !== web.origin ||
      env.ROOT_DOMAIN !== web.hostname || env.NEXT_PUBLIC_ROOT_DOMAIN !== web.hostname)
    throw new Error("Staging requires its own HTTPS origin and same-origin /api configuration");
  if (!env.INTERNAL_RESTAURANT_REWRITE_SECRET || env.INTERNAL_RESTAURANT_REWRITE_SECRET.length < 32 ||
      env.INTERNAL_RESTAURANT_REWRITE_SECRET === env.JWT_SECRET ||
      env.TRUST_PROXY !== '127.0.0.1' || env.API_HOST !== '127.0.0.1' ||
      env.ORDERSAWA_PREVIEW_INTERNAL_API_URL !== 'http://127.0.0.1:' + (env.PORT || '5000') ||
      !env.ORDERSAWA_RELEASE_ID?.startsWith('staging-') || env.DOMAIN_VERIFY_BYPASS === 'true' ||
      env.SEED_DEMO_RESTAURANT === 'true' || env.ENABLE_DISPOSABLE_NETWORK_ORDERS === '1')
    throw new Error("Unsafe staging runtime settings");
}
