param([switch]$SkipIntegration)
. (Join-Path $PSScriptRoot 'demo-common.ps1')
$p = Get-DemoPaths
$git = 'C:\Program Files\Git\cmd\git.exe'
if (-not (Test-Path -LiteralPath $git)) { $git = 'git.exe' }
$commit = (& $git -C $p.Repo -c "safe.directory=$($p.Repo.Replace('\','/'))" rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $commit -notmatch '^[0-9a-f]{40}$') { throw 'Unable to identify source commit.' }
$files = @(& $git -C $p.Repo -c "safe.directory=$($p.Repo.Replace('\','/'))" ls-files | Sort-Object)
if ($LASTEXITCODE -ne 0 -or $files.Count -lt 20) { throw 'Unable to enumerate tracked source files.' }
$hashRows = New-Object Collections.Generic.List[string]
foreach ($relative in $files) {
  $source = Join-Path $p.Repo $relative
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Tracked source missing: $relative" }
  $hashRows.Add("$relative $((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash)")
}
$sha = [Security.Cryptography.SHA256]::Create()
try { $bytes = [Text.Encoding]::UTF8.GetBytes(($hashRows -join "`n")); $sourceHash = ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant() }
finally { $sha.Dispose() }
$id = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ') + '-' + $sourceHash.Substring(0,12)
$release = Join-Path (Join-Path $p.State 'releases') $id
if (Test-Path -LiteralPath $release) { throw 'Release directory already exists; retry in a later second.' }
New-Item -ItemType Directory -Path $release -Force | Out-Null
foreach ($relative in $files) {
  $dest = Join-Path $release $relative
  New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $p.Repo $relative) -Destination $dest
}
$dirty = @(& $git -C $p.Repo -c "safe.directory=$($p.Repo.Replace('\','/'))" status --porcelain --untracked-files=no).Count -gt 0
$env:NEXT_PUBLIC_API_URL = '/api'
$env:ORDERSAWA_RELEASE_ID = $id
$env:ORDERSAWA_PREVIEW_INTERNAL_API_URL = 'http://127.0.0.1:5001'
$env:npm_config_cache = Join-Path $p.State 'npm-cache'
New-Item -ItemType Directory -Path $env:npm_config_cache -Force | Out-Null
Set-Location $release
& npm.cmd ci --no-audit --no-fund --prefer-offline
if ($LASTEXITCODE -ne 0) { throw "npm ci failed; release $id not activated." }
$env:NODE_ENV = 'production'
& npm.cmd run prisma:generate
if ($LASTEXITCODE -ne 0) { throw "Prisma generation failed; release $id not activated." }
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "Build failed; release $id not activated." }
& npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { throw "Typecheck failed; release $id not activated." }
& npm.cmd run test:shared
if ($LASTEXITCODE -ne 0) { throw "Shared tests failed; release $id not activated." }
& npm.cmd run test -w '@menu/web'
if ($LASTEXITCODE -ne 0) { throw "Web tests failed; release $id not activated." }
if (-not $SkipIntegration) {
  $bin = $p.PgBin
  foreach ($exe in @('createdb.exe','dropdb.exe','pg_dump.exe','pg_restore.exe')) {
    if (-not (Test-Path -LiteralPath (Join-Path $bin $exe))) { throw "Missing PostgreSQL test tool $exe" }
  }
  $testRoot = Join-Path (Join-Path $p.State 'test-runs') $id
  New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
  $testDb = 'ordersawa_demo_release_checkout_' + (Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss') + '_' + $sourceHash.Substring(0,6)
  $created = $false
  try {
    & (Join-Path $bin 'createdb.exe') -h 127.0.0.1 -p 55448 -U ordersawa_preview $testDb
    if ($LASTEXITCODE -ne 0) { throw 'Disposable database creation failed.' }
    $created = $true
    $schemaDump = Join-Path $testRoot 'demo-schema.dump'
    & (Join-Path $bin 'pg_dump.exe') -h 127.0.0.1 -p 55448 -U ordersawa_preview -d ordersawa_unified_interactive_preview --schema-only -Fc -f $schemaDump
    if ($LASTEXITCODE -ne 0) { throw 'Demo schema-only export failed.' }
    & (Join-Path $bin 'pg_restore.exe') -h 127.0.0.1 -p 55448 -U ordersawa_preview -d $testDb --no-owner --no-privileges $schemaDump
    if ($LASTEXITCODE -ne 0) { throw 'Disposable schema restore failed.' }
    $env:WHATSAPP_CHECKOUT_TEST_DATABASE_URL = "postgresql://ordersawa_preview@127.0.0.1:55448/${testDb}?schema=public"
    & npm.cmd run test -w '@menu/api' -- --run src/modules/public-menu/public-whatsapp-checkout.integration.spec.ts
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL checkout integration tests failed.' }
  } finally {
    Remove-Item Env:WHATSAPP_CHECKOUT_TEST_DATABASE_URL -ErrorAction SilentlyContinue
    if ($created -and $testDb -match '^ordersawa_demo_release_checkout_[0-9]{14}_[0-9a-f]{6}$') {
      & (Join-Path $bin 'dropdb.exe') -h 127.0.0.1 -p 55448 -U ordersawa_preview $testDb
      if ($LASTEXITCODE -ne 0) { throw "Disposable test database $testDb could not be removed; review it manually." }
    }
  }
}
$manifest = [ordered]@{
  schemaVersion = 1; releaseId = $id; sourceHash = $sourceHash; gitCommit = $commit; dirtyTrackedSource = $dirty
  builtAtUtc = (Get-Date).ToUniversalTime().ToString('o'); nodeVersion = (& node --version).Trim()
  api = @{ sourceHash = $sourceHash; entry = 'apps/api/dist/main.js'; port = 5001 }
  web = @{ sourceHash = $sourceHash; entry = 'apps/web/.next'; port = 3102 }
  tests = @{ build = 'passed'; typecheck = 'passed'; shared = 'passed'; web = 'passed'; checkoutPostgres = $(if ($SkipIntegration) { 'skipped' } else { 'passed' }) }
}
$manifestPath = Join-Path $release 'release.json'
[IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
Write-Output ([pscustomobject]@{ ReleaseId = $id; SourceHash = $sourceHash; Path = $release; Manifest = $manifestPath; Integration = $manifest.tests.checkoutPostgres })
