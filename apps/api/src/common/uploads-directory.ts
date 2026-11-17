import { resolve } from "path";

/** Keep mutable Demo uploads outside immutable application releases. */
export function getUploadsDirectory() {
  return resolve(process.env.ORDERSAWA_DEMO_UPLOADS_DIR || "uploads");
}
