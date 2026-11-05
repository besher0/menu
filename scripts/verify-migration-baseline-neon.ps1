# Replays all checked-in Prisma migrations into a NEW, one-use schema in the
# already-reviewed disposable Neon PG18.6 database. Never operates on public
# schema tables or the schemas used by other integration suites.
# Run from the repo root: .\scripts\verify-migration-baseline-neon.ps1
# Does NOT modify .env or persist DB connection variables.
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$apiRoot = Join-Path $repoRoot "apps/api"
$envPath = Join-Path $apiRoot ".env"
$schema = "ordersawa_migration_replay_e2e"
$directHost = "ep-tiny-frost-b90v7e8c.c-7.eu-central-1.aws.neon.tech"
$pooledHost = "ep-tiny-frost-b90v7e8c-pooler.c-7.eu-central-1.aws.neon.tech"
$approvedHosts = @($directHost, $pooledHost)

if (-not (Test-Path $envPath)) { throw "Missing apps/api/.env" }

function Read-DotEnv([string]$name) {
  $line = Get-Content $envPath | Where-Object { $_ -match "^\s*$name\s*=" } | Select-Object -First 1
  if (-not $line) { throw "Missing $name in apps/api/.env" }
  $value = ($line -replace "^\s*$name\s*=\s*", "").Trim().Trim('"').Trim("'")
  if (-not $value) { throw "Empty $name in apps/api/.env" }
  return $value
}

function Verify-TestUrl([string]$raw, [string]$name) {
  try { $u = [Uri]$raw } catch { throw "Invalid $name" }
  if ($u.Scheme -notin @("postgres", "postgresql") -or
      $u.Host -notin $approvedHosts -or
      $u.AbsolutePath -cne "/neondb" -or
      $u.UserInfo.Split(":")[0] -cne "neondb_owner" -or
      -not $u.UserInfo.Contains(":") -or
      $u.Port -notin @(-1, 5432) -or
      $raw -notmatch '(?:\?|&)sslmode=require(?:&|$)') {
    throw "$name is NOT the exact reviewed disposable Neon test compute"
  }
  $queryKeys = @(([Uri]$raw).Query.TrimStart('?').Split('&') | ForEach-Object { ($_ -split '=', 2)[0].ToLowerInvariant() })
  if (($queryKeys | Where-Object { $_ -eq "schema" }).Count -gt 1 -or
      ($queryKeys | Where-Object { $_ -eq "channel_binding" }).Count -gt 1 -or
      ($queryKeys | Where-Object { $_ -eq "sslmode" }).Count -gt 1) {
    throw "$name contains duplicate connection parameters"
  }
  if ($raw -match '(?:\?|&)options=' -or
      ($raw -match '(?:\?|&)channel_binding=([^&]*)' -and $Matches[1] -cne "require")) {
    throw "$name contains unexpected PostgreSQL connection options"
  }
  if ($raw -match '(?:\?|&)schema=([^&]*)') {
    if ($Matches[1] -cne "public") { throw "$name selects an unexpected schema" }
    $raw = $raw -replace '([?&])schema=public(&?)', '$1'
    $raw = $raw.TrimEnd('?', '&')
  }
  if ($raw -notmatch '(?:\?|&)channel_binding=require(?:&|$)') {
    $raw += "&channel_binding=require"
  }
  return $raw
}

$originalDbUrl = Verify-TestUrl (Read-DotEnv "DATABASE_URL") "DATABASE_URL"
$originalDirectUrl = Verify-TestUrl (Read-DotEnv "DIRECT_URL") "DIRECT_URL"
if (([Uri]$originalDirectUrl).Host -ceq $pooledHost) {
  $fromHost = '(?<=@)' + [regex]::Escape($pooledHost) + '(?=[:/])'
  $originalDirectUrl = [regex]::Replace($originalDirectUrl, $fromHost, $directHost)
}
if (([Uri]$originalDirectUrl).Host -cne $directHost) {
  throw "Only the exact direct (non-pooler) disposable Neon host is permitted"
}
$testUrl = "$originalDirectUrl&schema=$schema&options=-c%20search_path%3D$schema"

$priorDbUrl = [Environment]::GetEnvironmentVariable("DATABASE_URL")
$priorDirectUrl = [Environment]::GetEnvironmentVariable("DIRECT_URL")
try {
  Push-Location $apiRoot
  try {
    $env:DATABASE_URL = $originalDirectUrl
    $env:DIRECT_URL = $originalDirectUrl
    Write-Host "1/5 Creating NEW isolated migration schema (will refuse reuse)..."
    & npx prisma db execute --file ../../scripts/migration-replay-neon-bootstrap.sql --schema prisma/schema.prisma
    if ($LASTEXITCODE -ne 0) { throw "Failed safe migration schema bootstrap" }

    $env:DATABASE_URL = $testUrl
    $env:DIRECT_URL = $testUrl
    Write-Host "2/5 Verifying marked schema, search_path and emptiness..."
    & npx prisma db execute --file ../../scripts/migration-replay-neon-preflight.sql --schema prisma/schema.prisma
    if ($LASTEXITCODE -ne 0) { throw "Refusing migrations: isolated schema preflight failed" }

    Write-Host "3/5 Replaying all nine historical Prisma migrations in test schema ONLY..."
    & npx prisma migrate deploy --schema prisma/schema.prisma
    if ($LASTEXITCODE -ne 0) { throw "Migration replay failed; inspect the disposable test schema, do not reset public" }

    Write-Host "4/5 Checking 34 tables, 15 enums, nine complete migrations and status..."
    & npx prisma db execute --file ../../scripts/migration-replay-neon-verify.sql --schema prisma/schema.prisma
    if ($LASTEXITCODE -ne 0) { throw "Post-migration identity or structure validation failed" }
    & npx prisma migrate status --schema prisma/schema.prisma
    if ($LASTEXITCODE -ne 0) { throw "Prisma migration status is not clean" }

    Write-Host "5/5 Checking current Prisma model drift..."
    & npx prisma migrate diff --from-url $testUrl --to-schema-datamodel prisma/schema.prisma --exit-code
    if ($LASTEXITCODE -ne 0) { throw "Schema drift detected or drift command failed (code $LASTEXITCODE)" }
    Write-Host "PASS: nine migrations from empty Neon PG18.6 schema, status clear, no Prisma schema drift."
  } finally {
    Pop-Location
  }
} finally {
  if ($null -eq $priorDbUrl) { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue }
  else { $env:DATABASE_URL = $priorDbUrl }
  if ($null -eq $priorDirectUrl) { Remove-Item Env:DIRECT_URL -ErrorAction SilentlyContinue }
  else { $env:DIRECT_URL = $priorDirectUrl }
  Write-Host "Original DATABASE_URL and DIRECT_URL process values restored; .env unchanged."
}
