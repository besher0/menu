const fs = require("fs");

function edit(path, edits) {
  let content = fs.readFileSync(path, "utf8");

  for (const [from, to, label] of edits) {
    if (!content.includes(from)) {
      console.error(`NOT FOUND: ${label}`);
      process.exit(1);
    }
    content = content.replace(from, to);
  }

  fs.writeFileSync(path, content, "utf8");
  console.log(`UPDATED: ${path}`);
}

edit("packages/shared/src/theme.ts", [
  [
`    surface: string;
    text: string;
    muted: string;`,
`    surface: string;
    textFirst: string;
    textSecondary: string;
    text: string;
    muted: string;`,
"ThemeSettings colors"
  ],
  [
`    surface: "#ffffff",
    text: "#151515",
    muted: "#7b7b7b",`,
`    surface: "#ffffff",
    textFirst: "#201217",
    textSecondary: "#60656f",
    text: "#151515",
    muted: "#7b7b7b",`,
"default colors"
  ],
  [
`    "--color-surface": theme.colors.surface,
    "--color-text": theme.colors.text,
    "--color-muted": theme.colors.muted,`,
`    "--color-surface": theme.colors.surface,
    "--color-text-first": theme.colors.textFirst ?? "#201217",
    "--color-text-secondary": theme.colors.textSecondary ?? "#60656f",
    "--color-text": theme.colors.text,
    "--color-muted": theme.colors.muted,`,
"CSS variables"
  ]
]);

edit("apps/web/src/components/dashboard/theme-builder-client.tsx", [
  [
`  { key: "surface", label: "Surface" },
  { key: "text", label: "Text" },`,
`  { key: "surface", label: "Surface" },
  { key: "textFirst", label: "Text First - اسم الوجبة" },
  { key: "textSecondary", label: "Text Secondary - وصف الوجبة" },
  { key: "text", label: "Text" },`,
"theme color controls"
  ]
]);

edit("apps/web/src/app/globals.css", [
  [
`.public-bottom-nav {
  background: white;`,
`.public-bottom-nav {
  background: var(--color-surface);`,
"footer surface"
  ],
  [
`.menu-product-row b {
  color: #201217;`,
`.menu-product-row b {
  color: var(--color-text-first);`,
"row product name"
  ],
  [
`.menu-product-row p {
  color: #666b73;`,
`.menu-product-row p {
  color: var(--color-text-secondary);`,
"row product description"
  ],
  [
`.menu-product-card b {
  color: #201217;`,
`.menu-product-card b {
  color: var(--color-text-first);`,
"card product name"
  ],
  [
`.menu-product-card p {
  color: #60656f;`,
`.menu-product-card p {
  color: var(--color-text-secondary);`,
"card product description"
  ],
  [
`.category-spotlight-card b {
  color: #201217;`,
`.category-spotlight-card b {
  color: var(--color-text-first);`,
"spotlight product name"
  ],
  [
`.category-spotlight-card p {
  color: #555b66;`,
`.category-spotlight-card p {
  color: var(--color-text-secondary);`,
"spotlight product description"
  ],
  [
`.theme-products p {
  color: var(--color-muted);`,
`.theme-products p {
  color: var(--color-text-secondary);`,
"theme preview description"
  ]
]);

console.log("");
console.log("DONE - Theme colors updated successfully.");
