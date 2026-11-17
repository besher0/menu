// This opt-in applies only to creating demo identities, never to ordinary application traffic.
export function disposableSeedDatabase(env: NodeJS.ProcessEnv): string {
  const message = "Demo seed requires an explicitly disposable local PostgreSQL database";
  if (!["development", "test"].includes(env.NODE_ENV ?? "") || !env.DATABASE_URL ||
      env.DATABASE_URL !== env.DIRECT_URL) throw new Error(message);
  let target: URL;
  try { target = new URL(env.DATABASE_URL); } catch { throw new Error(message); }
  if (!["postgres:", "postgresql:"].includes(target.protocol) || target.hostname !== "127.0.0.1" ||
      !/^\/ordersawa_disposable_[a-z0-9_]+$/.test(target.pathname) || target.search || target.hash)
    throw new Error(message);
  return target.pathname.slice(1);
}
