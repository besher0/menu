param([switch]$BuildOnly, [switch]$SkipIntegration)
. (Join-Path $PSScriptRoot 'demo-common.ps1')
if (-not $BuildOnly) {
  throw 'Activation is disabled until releases, active pointer, and service control are isolated from the Codex sandbox and an owner-approved protected activator is installed. Use -BuildOnly to prepare a candidate without touching live Demo.'
}
$p = Get-DemoPaths
New-Item -ItemType Directory -Path $p.State -Force | Out-Null
$lockPath = Join-Path $p.State 'update.lock'
$lock = [IO.File]::Open($lockPath,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try {
  if (-not $BuildOnly) { Assert-DemoServiceSet; $previous = Read-DemoActive }
  $output = @(& (Join-Path $PSScriptRoot 'build-demo-release.ps1') -SkipIntegration:$SkipIntegration)
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw 'Release build failed.' }
  if ($output.Count -eq 0 -or -not $output[-1].ReleaseId) { throw 'Release builder did not return a validated candidate.' }
  $candidate = $output[-1]
  $output | Select-Object -SkipLast 1 | ForEach-Object { Write-Host $_ }
  $manifest = Get-Content -LiteralPath $candidate.Manifest -Raw | ConvertFrom-Json
  if ($manifest.releaseId -ne $candidate.ReleaseId -or $manifest.api.sourceHash -ne $manifest.web.sourceHash -or
      $manifest.tests.build -ne 'passed' -or $manifest.tests.typecheck -ne 'passed' -or
      $manifest.tests.shared -ne 'passed' -or $manifest.tests.web -ne 'passed') { throw 'Candidate release manifest invalid.' }
  if ($BuildOnly) {
    Write-Output "Built and tested candidate $($candidate.ReleaseId); live Demo untouched."
    Write-Output $candidate
    return
  }
  if ($manifest.sourceHash -eq $previous.Active.sourceHash) {
    Write-Output "Source hash is already active on Demo ($($previous.Active.releaseId)); no services restarted."
    return
  }
  if ($manifest.tests.checkoutPostgres -ne 'passed') { throw 'Checkout PostgreSQL integration is required for activation.' }
  $oldSchema = Join-Path $previous.Path 'apps\api\prisma\schema.prisma'
  $newSchema = Join-Path $candidate.Path 'apps\api\prisma\schema.prisma'
  if ((Get-FileHash -LiteralPath $oldSchema -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $newSchema -Algorithm SHA256).Hash) {
    throw 'Prisma schema changed. Automatic Demo update refused; request a separate migration review.'
  }
  & (Join-Path $PSScriptRoot 'backup-demo.ps1') | Out-Host
  $flag = Join-Path $p.State 'maintenance.flag'
  $activePath = Join-Path $p.State 'active.json'
  $previousJson = Get-Content -LiteralPath $activePath -Raw
  $next = [ordered]@{ schemaVersion = 1; releaseId = $candidate.ReleaseId; sourceHash = $candidate.SourceHash; activatedAtUtc = (Get-Date).ToUniversalTime().ToString('o') }
  [IO.File]::WriteAllText($flag,'update in progress')
  try {
    foreach ($name in @('OrderSawaDemoWeb','OrderSawaDemoApi')) {
      if ((Get-DemoService $name).Status -ne 'Stopped') { Stop-Service -Name $name; (Get-Service $name).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(90)) }
    }
    Assert-DemoPortOwnership @(5001,3102)
    Write-DemoActiveAtomic $p.State ($next | ConvertTo-Json -Depth 5)
    foreach ($name in @('OrderSawaDemoApi','OrderSawaDemoWeb')) {
      Start-Service -Name $name
      (Get-Service $name).WaitForStatus('Running',[TimeSpan]::FromSeconds(90))
      if ($name -eq 'OrderSawaDemoApi') { Wait-DemoEndpoint 'http://127.0.0.1:5001/health' $candidate.ReleaseId 120 }
      else { Wait-DemoEndpoint 'http://127.0.0.1:3102/login' $candidate.ReleaseId 120 }
    }
    Remove-Item -LiteralPath $flag
    Wait-DemoEndpoint 'http://127.0.0.1:3210/__demo/version' $candidate.ReleaseId 30
    Write-Output "Demo activated: $($candidate.ReleaseId). PostgreSQL and tunnel were not restarted."
  } catch {
    $failure = $_.Exception.Message
    foreach ($name in @('OrderSawaDemoWeb','OrderSawaDemoApi')) {
      try { if ((Get-DemoService $name).Status -ne 'Stopped') { Stop-Service -Name $name; (Get-Service $name).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(90)) } } catch {}
    }
    Write-DemoActiveAtomic $p.State $previousJson
    try {
      Start-Service -Name 'OrderSawaDemoApi'; (Get-Service 'OrderSawaDemoApi').WaitForStatus('Running',[TimeSpan]::FromSeconds(90))
      Wait-DemoEndpoint 'http://127.0.0.1:5001/health' $previous.Active.releaseId 120
      Start-Service -Name 'OrderSawaDemoWeb'; (Get-Service 'OrderSawaDemoWeb').WaitForStatus('Running',[TimeSpan]::FromSeconds(90))
      Wait-DemoEndpoint 'http://127.0.0.1:3102/login' $previous.Active.releaseId 120
      Remove-Item -LiteralPath $flag -ErrorAction SilentlyContinue
      throw "Candidate activation failed ($failure); previous application release restored. No database rollback performed."
    } catch {
      if ($_.Exception.Message -like 'Candidate activation failed*') { throw }
      throw "Candidate activation failed ($failure); rollback health failed ($($_.Exception.Message)). Gateway remains in maintenance mode."
    }
  }
} finally { $lock.Dispose() }
