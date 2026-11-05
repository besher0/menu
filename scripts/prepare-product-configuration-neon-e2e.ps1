# Sets up a schema isolated from public tables on the already-disposable Neon test branch.
# Run in the SAME existing PowerShell session from repository root:
#   .\scripts\prepare-product-configuration-neon-e2e.ps1
# Do not start a child powershell.exe -File; that would lose the test environment variables.
# No passwords are written to disk or printed, no production DB migrations are run.
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$apiRoot = Join-Path $repoRoot "apps/api"
$envPath = Join-Path $apiRoot ".env"
if (-not (Test-Path $envPath)) { throw "Missing apps/api/.env" }

function Read-DotEnv([string]$name) {
  $line = Get-Content $envPath | Where-Object { $_ -match "^\s*$name\s*=" } | Select-Object -First 1
  if (-not $line) { throw "Missing $name in apps/api/.env" }
  $value = ($line -replace "^\s*$name\s*=\s*", "").Trim().Trim('"').Trim("'")
  if (-not $value) { throw "Empty $name in apps/api/.env" }
  return $value
}

$testHosts = @(
  "ep-tiny-frost-b90v7e8c.c-7.eu-central-1.aws.neon.tech",
  "ep-tiny-frost-b90v7e8c-pooler.c-7.eu-central-1.aws.neon.tech"
)
$schema = "ordersawa_product_config_e2e"
function Verify-And-ScopeUrl([string]$raw, [string]$key) {
  try { $uri = [Uri]$raw } catch { throw "Malformed $key" }
  if ($uri.Scheme -notin @("postgresql", "postgres") -or
      $uri.Host -notin $testHosts -or
      $uri.AbsolutePath -ne "/neondb" -or
      $uri.UserInfo.Split(":")[0] -ne "neondb_owner" -or
      -not $uri.UserInfo.Contains(":") -or
      $uri.Port -notin @(-1, 5432) -or
      $raw -notmatch '(?:\?|&)sslmode=require(?:&|$)') {
    throw "$key does not point to the pinned disposable Neon database"
  }
  if ($raw -match '(?:\?|&)schema=([^&]*)') {
    if ($Matches[1] -ne "public") { throw "$key already selects an unexpected schema" }
    $raw = $raw -replace '([?&])schema=public(&?)', '$1'
    $raw = $raw.TrimEnd('?', '&')
  }
  if ($raw -match '(?:\?|&)channel_binding=([^&]*)' -and $Matches[1] -ne "require") {
    throw "$key has an unexpected channel_binding setting"
  }
  if ($raw -notmatch '(?:\?|&)channel_binding=require(?:&|$)') {
    $raw += "&channel_binding=require"
  }
  return $raw
}

$originalDbUrl = Read-DotEnv "DATABASE_URL"
$originalDirectUrl = Read-DotEnv "DIRECT_URL"
$baseDbUrl = Verify-And-ScopeUrl $originalDbUrl "DATABASE_URL"
$baseDirectUrl = Verify-And-ScopeUrl $originalDirectUrl "DIRECT_URL"
$priorDbUrl = [Environment]::GetEnvironmentVariable("DATABASE_URL")
$priorDirectUrl = [Environment]::GetEnvironmentVariable("DIRECT_URL")
try {
  Push-Location $apiRoot
  try {
    # Bootstrap ONLY the named dedicated schema. The SQL refuses an unexpected
    # PG version, DB role, current schema or pre-existing unmarked test schema.
    $env:DATABASE_URL = $baseDbUrl
    $env:DIRECT_URL = $baseDirectUrl
    Write-Host "Preparing marked isolated test schema (no public table changes)..."
    & npx prisma db execute --file ../../scripts/product-configuration-neon-e2e-schema.sql --schema prisma/schema.prisma
    if ($LASTEXITCODE -ne 0) { throw "Isolated test schema creation failed" }

    $env:DATABASE_URL = "$baseDbUrl&schema=$schema"
    $env:DIRECT_URL = "$baseDirectUrl&schema=$schema"
    Write-Host "Pushing Prisma schema ONLY into $schema ..."
    & npx prisma db push --schema prisma/schema.prisma --skip-generate
    if ($LASTEXITCODE -ne 0) { throw "Isolated Prisma schema push failed" }
  } finally {
    Pop-Location
  }
} finally {
  if ($null -eq $priorDbUrl) { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue }
  else { $env:DATABASE_URL = $priorDbUrl }
  if ($null -eq $priorDirectUrl) { Remove-Item Env:DIRECT_URL -ErrorAction SilentlyContinue }
  else { $env:DIRECT_URL = $priorDirectUrl }
}

$env:PRODUCT_CONFIGURATION_TEST_DATABASE_URL = "$baseDbUrl&schema=$schema"
$env:PRODUCT_CONFIGURATION_NEON_TESTS = "1"
$env:NODE_ENV = "test"
Write-Host "Isolated schema ready. Only PRODUCT_CONFIGURATION_TEST_DATABASE_URL points to $schema."
Write-Host "The original DATABASE_URL and DIRECT_URL were preserved."
