param([Parameter(Mandatory)][string]$ReleaseId, [switch]$ConfirmRollback)
. (Join-Path $PSScriptRoot 'demo-common.ps1')
throw 'Automated rollback is disabled until protected published releases and a reviewed activator exist. Do not switch a service to a Codex-writable release.'
if (-not $ConfirmRollback) { throw 'Explicit -ConfirmRollback is required; only the application release is switched.' }
Assert-DemoServiceSet
$p = Get-DemoPaths
$current = Read-DemoActive
if ($ReleaseId -notmatch '^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$') { throw 'Invalid built Demo release ID.' }
if ($ReleaseId -eq $current.Active.releaseId) { Write-Output "Release $ReleaseId is already active; no services restarted."; return }
$targetPath = Join-Path (Join-Path $p.State 'releases') $ReleaseId
$targetManifest = Get-Content -LiteralPath (Join-Path $targetPath 'release.json') -Raw | ConvertFrom-Json
if ($targetManifest.schemaVersion -ne 1 -or $targetManifest.releaseId -ne $ReleaseId -or
    $targetManifest.sourceHash -ne $targetManifest.api.sourceHash -or $targetManifest.sourceHash -ne $targetManifest.web.sourceHash -or
    $targetManifest.tests.checkoutPostgres -ne 'passed' -or $targetManifest.tests.build -ne 'passed') { throw 'Target release manifest is invalid or untested.' }
foreach ($artifact in @('apps\api\dist\main.js','apps\web\.next\BUILD_ID')) {
  if (-not (Test-Path -LiteralPath (Join-Path $targetPath $artifact) -PathType Leaf)) { throw "Missing target artifact: $artifact" }
}
if ((Get-FileHash -LiteralPath (Join-Path $current.Path 'apps\api\prisma\schema.prisma') -Algorithm SHA256).Hash -ne
    (Get-FileHash -LiteralPath (Join-Path $targetPath 'apps\api\prisma\schema.prisma') -Algorithm SHA256).Hash) {
  throw 'Database schema differs; automatic application-only rollback refused.'
}
$lockPath = Join-Path $p.State 'update.lock'
$lock = [IO.File]::Open($lockPath,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try {
  & (Join-Path $PSScriptRoot 'backup-demo.ps1') | Out-Host
  $flag = Join-Path $p.State 'maintenance.flag'
  $oldJson = Get-Content -LiteralPath (Join-Path $p.State 'active.json') -Raw
  $newPointer = [ordered]@{schemaVersion=1;releaseId=$ReleaseId;sourceHash=$targetManifest.sourceHash;activatedAtUtc=(Get-Date).ToUniversalTime().ToString('o')}
  [IO.File]::WriteAllText($flag,'application rollback in progress')
  try {
    foreach ($name in @('OrderSawaDemoWeb','OrderSawaDemoApi')) {
      if ((Get-DemoService $name).Status -ne 'Stopped') { Stop-Service -Name $name; (Get-Service $name).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(90)) }
    }
    Assert-DemoPortOwnership @(5001,3102)
    Write-DemoActiveAtomic $p.State ($newPointer | ConvertTo-Json)
    foreach ($name in @('OrderSawaDemoApi','OrderSawaDemoWeb')) {
      Start-Service -Name $name
      (Get-Service $name).WaitForStatus('Running',[TimeSpan]::FromSeconds(90))
      if ($name -eq 'OrderSawaDemoApi') { Wait-DemoEndpoint 'http://127.0.0.1:5001/health' $ReleaseId 120 }
      else { Wait-DemoEndpoint 'http://127.0.0.1:3102/login' $ReleaseId 120 }
    }
    Remove-Item -LiteralPath $flag
    Wait-DemoEndpoint 'http://127.0.0.1:3210/__demo/version' $ReleaseId 30
    Write-Output "Application rolled back from $($current.Active.releaseId) to $ReleaseId. PostgreSQL and tunnel were not restarted."
  } catch {
    $failure = $_.Exception.Message
    foreach ($name in @('OrderSawaDemoWeb','OrderSawaDemoApi')) {
      try { if ((Get-DemoService $name).Status -ne 'Stopped') { Stop-Service -Name $name; (Get-Service $name).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(90)) } } catch {}
    }
    Write-DemoActiveAtomic $p.State $oldJson
    try {
      Start-Service -Name 'OrderSawaDemoApi'; (Get-Service 'OrderSawaDemoApi').WaitForStatus('Running',[TimeSpan]::FromSeconds(90))
      Wait-DemoEndpoint 'http://127.0.0.1:5001/health' $current.Active.releaseId 120
      Start-Service -Name 'OrderSawaDemoWeb'; (Get-Service 'OrderSawaDemoWeb').WaitForStatus('Running',[TimeSpan]::FromSeconds(90))
      Wait-DemoEndpoint 'http://127.0.0.1:3102/login' $current.Active.releaseId 120
      Remove-Item -LiteralPath $flag -ErrorAction SilentlyContinue
      throw "Requested rollback failed ($failure); original application release restored. No database rollback performed."
    } catch {
      if ($_.Exception.Message -like 'Requested rollback failed*') { throw }
      throw "Requested rollback failed ($failure); recovery health failed ($($_.Exception.Message)). Gateway remains in maintenance mode."
    }
  }
} finally { $lock.Dispose() }
