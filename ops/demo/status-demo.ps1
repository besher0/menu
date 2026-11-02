. (Join-Path $PSScriptRoot 'demo-common.ps1')
$p = Get-DemoPaths
foreach ($name in Get-DemoNames) {
  $service = Get-DemoService $name
  [pscustomobject]@{ Layer = $name; Installed = [bool]$service; Status = $(if ($service) { $service.Status.ToString() } else { 'NotInstalled' }); StartType = $(if ($service) { $service.StartType.ToString() } else { '-' }) }
}
try {
  $active = Read-DemoActive
  [pscustomobject]@{ ReleaseId = $active.Active.releaseId; GitCommit = $active.Release.gitCommit; SourceHash = $active.Active.sourceHash; BuiltAtUtc = $active.Release.builtAtUtc }
} catch { Write-Warning $_.Exception.Message }
try {
  $version = Invoke-RestMethod -Uri 'http://127.0.0.1:3210/__demo/version' -Headers @{ Host='rydtest.ordersawa.com' } -TimeoutSec 5
  [pscustomobject]@{ GatewayHealthy = $version.ok; ApiMatches = $version.api; WebMatches = $version.web; ServingRelease = $version.releaseId }
} catch { Write-Warning 'Managed gateway/version is not ready. This may be normal before installation.' }
$pg = Join-Path $p.PgBin 'pg_isready.exe'
if (Test-Path -LiteralPath $pg) { & $pg -h 127.0.0.1 -p 55448 }
