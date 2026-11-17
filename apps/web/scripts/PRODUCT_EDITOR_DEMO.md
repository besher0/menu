# Product Editor V62 — isolated acceptance / interactive DEMO

This uses the **real React editor and authenticated API**, on a newly created loopback PostgreSQL cluster with synthetic restaurant/library/media fixtures. It never reads `.env`, seeds a customer account, changes Windows services, or deploys a preview. Existing application routes are used; no production DEMO page is added.

Prerequisites: installed workspace dependencies, generated Prisma client, production build, PostgreSQL `initdb`/`pg_ctl`/`psql`, Python, Chrome/Edge and Playwright available as a QA tool. The browser uses the repository's existing demo pizza photos. No live password/token is required or accepted.

From the repository root in PowerShell:

```powershell
# Build with the existing sanitized build and browser-credential check.
python scripts/build-with-credential-check.py

$env:UNIFIED_V62_BROWSER_SCRIPT = (Resolve-Path 'apps/web/scripts/test-product-editor-fields.cjs').Path
$env:UNIFIED_V62_BROWSER_OUTPUT = Join-Path $PWD 'dist/product-editor-browser'
$env:PLAYWRIGHT_MODULE = '<absolute path to your QA installation of playwright>'
$env:V62_BROWSER_EXECUTABLE = '<absolute path to the Chrome for Testing executable matching that Playwright version>'

# Automated acceptance: 1280 / 430 / 390 / 360, including Task 3 regression.
$env:UNIFIED_EDITOR_DEMO_SECONDS = '0'
python apps/api/prisma/test-unified-product-editor.py --postgres-bin '<PostgreSQL bin directory>'

# Optional interactive DEMO: creates synthetic populated products, opens Chrome,
# and leaves the saved V2 product editor available for ten minutes.
# Keep this terminal open. All processes are temporary and are stopped afterward.
$env:UNIFIED_EDITOR_DEMO_SECONDS = '600'
python apps/api/prisma/test-unified-product-editor.py --postgres-bin '<PostgreSQL bin directory>'
Remove-Item Env:UNIFIED_EDITOR_DEMO_SECONDS
```

Interactive mode is explicitly requested by the environment variable (0..900 seconds). It runs at desktop width, opens a product with uploaded demo images, Arabic/mixed text, moods, independent flags, ingredient selections, VALUE/PRESENCE details, and Configuration V2. It prints the temporary **loopback** URL; it is not a LAN/4G preview. Automatic acceptance mode performs the four viewport checks. An interactive single-width run is not evidence of four-width acceptance.

Use the browser revision supplied by the selected Playwright package (`node <playwright/cli.js> install chromium`) in a QA-only browser directory if needed. This does not require replacing the owner's installed Chrome. Playwright does not guarantee arbitrary `executablePath` versions; the task's final acceptance uses its matching Chrome for Testing 151.0.7922.34, not the installed Chrome 157. Both browser and Playwright remain QA tools, not application runtime dependencies.

The fixture owns its random database name, port and upload directory under `dist/qa-unified-editor/<random>/`. The runner checks those identities before use, closes its API/Web/browser processes, and stops only its own PostgreSQL cluster. Logs and synthetic fixtures remain there for inspection; do not point the runner at an existing database. The deliberate malformed-upload and 409/500 scenarios verify draft retention and may briefly show an error before the interactive editor reopens.

Artifacts: `fields-browser-results.json`, `fields-*.png`, `picker-*.png`; Task 3 browser evidence is in `task3-regression/`. The PostgreSQL runner also writes integration and migration evidence. Default API tests without the explicit browser script skip the optional browser lifecycle; a skip must not be counted as a pass.
