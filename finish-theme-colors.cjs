const fs = require("fs");

function replaceIfNeeded(path, from, to, check, label) {
  let content = fs.readFileSync(path, "utf8");

  if (content.includes(check)) {
    console.log(`ALREADY DONE: ${label}`);
    return;
  }

  if (!content.includes(from)) {
    console.error(`NOT FOUND: ${label}`);
    process.exitCode = 1;
    return;
  }

  content = content.replace(from, to);
  fs.writeFileSync(path, content, "utf8");
  console.log(`UPDATED: ${label}`);
}

// صفحة الثيمات
replaceIfNeeded(
  "apps/web/src/components/dashboard/theme-builder-client.tsx",
`  { key: "surface", label: "Surface" },
  { key: "text", label: "Text" },`,
`  { key: "surface", label: "Surface" },
  { key: "textFirst", label: "Text First - اسم الوجبة" },
  { key: "textSecondary", label: "Text Secondary - وصف الوجبة" },
  { key: "text", label: "Text" },`,
`{ key: "textFirst",`,
"Theme text color controls"
);

// Footer
replaceIfNeeded(
  "apps/web/src/app/globals.css",
`.public-bottom-nav {
  background: white;`,
`.public-bottom-nav {
  background: var(--color-surface);`,
`background: var(--color-surface);`,
"Footer Surface"
);

// اسم المنتج single row
replaceIfNeeded(
  "apps/web/src/app/globals.css",
`.menu-product-row b {
  color: #201217;`,
`.menu-product-row b {
  color: var(--color-text-first);`,
`.menu-product-row b {
  color: var(--color-text-first);`,
"Product row name"
);

// وصف المنتج single row
replaceIfNeeded(
  "apps/web/src/app/globals.css",
`.menu-product-row p {
  color: #666b73;`,
`.menu-product-row p {
  color: var(--color-text-secondary);`,
`.menu-product-row p {
  color: var(--color-text-secondary);`,
"Product row description"
);

// اسم المنتج cards
replaceIfNeeded(
  "apps/web/src/app/globals.css",
`.menu-product-card b {
  color: #201217;`,
`.menu-product-card b {
  color: var(--color-text-first);`,
`.menu-product-card b {
  color: var(--color-text-first);`,
"Product card name"
);

// وصف المنتج cards
replaceIfNeeded(
  "apps/web/src/app/globals.css",
`.menu-product-card p {
  color: #60656f;`,
`.menu-product-card p {
  color: var(--color-text-secondary);`,
`.menu-product-card p {
  color: var(--color-text-secondary);`,
"Product card description"
);

// Spotlight name
replaceIfNeeded(
  "apps/web/src/app/globals.css",
`.category-spotlight-card b {
  color: #201217;`,
`.category-spotlight-card b {
  color: var(--color-text-first);`,
`.category-spotlight-card b {
  color: var(--color-text-first);`,
"Spotlight product name"
);

// Spotlight description
replaceIfNeeded(
  "apps/web/src/app/globals.css",
`.category-spotlight-card p {
  color: #555b66;`,
`.category-spotlight-card p {
  color: var(--color-text-secondary);`,
`.category-spotlight-card p {
  color: var(--color-text-secondary);`,
"Spotlight product description"
);

// Theme preview
replaceIfNeeded(
  "apps/web/src/app/globals.css",
`.theme-products p {
  color: var(--color-muted);`,
`.theme-products p {
  color: var(--color-text-secondary);`,
`.theme-products p {
  color: var(--color-text-secondary);`,
"Theme preview description"
);

console.log("DONE");
