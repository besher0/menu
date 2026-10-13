import { readFileSync } from "node:fs";
import { buildNetworkWhatsappDemo } from "./network-order-whatsapp-demo";
import { formatNetworkOrderWhatsappMessage } from "./network-order-whatsapp-formatter";

const kind = process.argv[2];
const locale = process.argv[3];
if (kind === "snapshot" && locale) {
  const savedSnapshot: unknown = JSON.parse(readFileSync(locale, "utf8"));
  process.stdout.write(`${formatNetworkOrderWhatsappMessage(savedSnapshot)}\n`);
} else if ((kind === "pizza" || kind === "combo") && (locale === "ar" || locale === "en")) {
  process.stdout.write(`${formatNetworkOrderWhatsappMessage(buildNetworkWhatsappDemo(kind, locale))}\n`);
} else {
  process.stderr.write("Usage: npm run preview:network-whatsapp -w @menu/api -- pizza|combo ar|en\n");
  process.stderr.write("   or: npm run preview:network-whatsapp -w @menu/api -- snapshot path-to-local-cartSnapshot.json\n");
  process.exitCode = 1;
}
