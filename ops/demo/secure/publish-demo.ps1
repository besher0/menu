param(
  [string]$CandidateArchive,
  [string]$ApprovedSha256,
  [string]$RollbackReleaseId,
  [switch]$VerifyOnly,
  [switch]$ConfirmActivate,
  [switch]$ConfirmRollback
)
. (Join-Path $PSScriptRoot 'secure-common.ps1')
if ($CandidateArchive -and $RollbackReleaseId) { throw 'Choose publication or rollback, not both.' }
if ($VerifyOnly) {
  if (-not $CandidateArchive) { throw '-VerifyOnly needs a candidate archive.' }
  Assert-Sha256 $ApprovedSha256
  if ((Get-FileHash -LiteralPath $CandidateArchive -Algorithm SHA256).Hash -cne $ApprovedSha256.ToUpperInvariant()) { throw 'Candidate package differs from approved SHA-256.' }
  $manifest = Read-PackageManifest $CandidateArchive
  [pscustomobject]@{ ReleaseId=$manifest.releaseId; SourceHash=$manifest.sourceHash; PackageSha256=$ApprovedSha256.ToUpperInvariant(); Verified=$true; Activated=$false }
  return
}
$config = Get-ProtectedConfig
Assert-Owner $config
$root = $config.root
if (-not $CandidateArchive -and -not $RollbackReleaseId) { throw 'Specify a candidate or a published rollback release.' }
if ($CandidateArchive -and -not $ConfirmActivate) { throw 'Explicit -ConfirmActivate and owner-approved SHA-256 are required.' }
if ($RollbackReleaseId -and -not $ConfirmRollback) { throw 'Explicit -ConfirmRollback is required.' }
$lockPath = Join-Path $root 'update.lock'
$lock = [IO.File]::Open($lockPath,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try {
  $targetId = $null
  $targetSha = $null
  if ($CandidateArchive) {
    Assert-Sha256 $ApprovedSha256
    Assert-ChildPath $config.candidatePackages $CandidateArchive
    if (-not (Test-Path -LiteralPath $CandidateArchive -PathType Leaf)) { throw 'Candidate package missing.' }
    if ((Get-FileHash -LiteralPath $CandidateArchive -Algorithm SHA256).Hash -cne $ApprovedSha256.ToUpperInvariant()) { throw 'Candidate changed after owner approval.' }
    $manifest = Read-PackageManifest $CandidateArchive
    $targetId = $manifest.releaseId
    $targetSha = $ApprovedSha256.ToUpperInvariant()
    $final = Join-Path (Join-Path $root 'releases') $targetId
    Assert-ChildPath (Join-Path $root 'releases') $final
    if (Test-Path -LiteralPath $final) { throw 'Release already published; use rollback only for an existing protected release.' }
    $storedArchive = Join-Path (Join-Path $root 'archives') "$targetId.zip"
    if (Test-Path -LiteralPath $storedArchive) { throw 'Protected package ID already exists.' }
    $pendingArchive = Join-Path (Join-Path $root 'archives') ('.pending-' + [guid]::NewGuid().ToString('N') + '.zip')
    Copy-Item -LiteralPath $CandidateArchive -Destination $pendingArchive
    if ((Get-FileHash -LiteralPath $pendingArchive -Algorithm SHA256).Hash -cne $targetSha) { throw 'Package changed while being copied; protected copy retained for inspection.' }
    $pendingRelease = Join-Path (Join-Path $root 'releases') ('.pending-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $pendingRelease | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($pendingArchive,$pendingRelease)
    $extracted = Get-Content -LiteralPath (Join-Path $pendingRelease 'release.json') -Raw | ConvertFrom-Json
    if ($extracted.releaseId -cne $targetId -or $extracted.sourceHash -cne $manifest.sourceHash) { throw 'Extracted release manifest differs from approved archive.' }
    $treeSha = Get-TreeDigest $pendingRelease
    [IO.Directory]::Move($pendingRelease,$final)
    [IO.File]::Move($pendingArchive,$storedArchive)
    $index = Get-PublishedIndex $root
    $rows = @($index.releases) + @([pscustomobject]@{ releaseId=$targetId; archiveSha256=$targetSha; treeSha256=$treeSha; sourceHash=$manifest.sourceHash; approvedAtUtc=(Get-Date).ToUniversalTime().ToString('o') })
    Write-JsonAtomic (Join-Path $root 'release-index.json') ([ordered]@{schemaVersion=1;releases=$rows})
  } else {
    Assert-ReleaseId $RollbackReleaseId
    $targetId = $RollbackReleaseId
  }
  $published = Assert-PublishedRelease $root $targetId
  $activePath = Join-Path $root 'active.json'
  $oldJson = Get-Content -LiteralPath $activePath -Raw
  $old = $oldJson | ConvertFrom-Json
  if ($old.releaseId -eq $targetId) { Write-Output "Already active: $targetId"; return }
  $oldPublished = Assert-PublishedRelease $root $old.releaseId
  $oldSchema = Join-Path $oldPublished.Path 'apps\api\prisma\schema.prisma'
  $newSchema = Join-Path $published.Path 'apps\api\prisma\schema.prisma'
  if ((Get-FileHash -LiteralPath $oldSchema -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $newSchema -Algorithm SHA256).Hash) { throw 'Prisma schema differs; separate migration approval required.' }
  & (Join-Path $PSScriptRoot 'backup-protected-demo.ps1') -Root $root
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw 'Protected backup failed.' }
  $flag = Join-Path $root 'maintenance.flag'
  [IO.File]::WriteAllText($flag,'app release change',[Text.UTF8Encoding]::new($false))
  try {
    foreach ($name in @('OrderSawaDemoWeb','OrderSawaDemoApi')) {
      Assert-DemoAppServiceName $name
      $service = Get-Service -Name $name -ErrorAction Stop
      if ($service.Status -ne 'Stopped') { Stop-Service -Name $name -ErrorAction Stop; $service.WaitForStatus('Stopped',[TimeSpan]::FromSeconds(90)) }
    }
    $listeners = @(netstat.exe -ano -p tcp | Where-Object { $_ -match '^\s*TCP\s+\S+:(5001|3102)\s+\S+\s+LISTENING\s+' })
    if ($listeners.Count) { throw 'Old API/Web listener remains after service stop; no pointer switch.' }
    $newPointer = [ordered]@{ schemaVersion=1; releaseId=$targetId; sourceHash=$published.Entry.sourceHash; activatedAtUtc=(Get-Date).ToUniversalTime().ToString('o') }
    Write-JsonAtomic $activePath $newPointer
    foreach ($name in @('OrderSawaDemoApi','OrderSawaDemoWeb')) {
      Assert-DemoAppServiceName $name
      Start-Service -Name $name -ErrorAction Stop
      (Get-Service -Name $name).WaitForStatus('Running',[TimeSpan]::FromSeconds(90))
      $uri = if ($name -eq 'OrderSawaDemoApi') { 'http://127.0.0.1:5001/health' } else { 'http://127.0.0.1:3102/login' }
      $until = (Get-Date).AddSeconds(120)
      $ready = $false
      while ((Get-Date) -lt $until) {
        try { $r = Invoke-WebRequest -Uri $uri -Headers @{Host='rydtest.ordersawa.com'} -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -eq 200 -and @($r.Headers['X-OrderSawa-Release'])[0] -eq $targetId) { $ready=$true; break } } catch {}
        Start-Sleep -Seconds 2
      }
      if (-not $ready) { throw "Service readiness failed: $name" }
    }
    Remove-Item -LiteralPath $flag
    Write-Output "Published and active: $targetId. PostgreSQL and tunnel were not restarted."
  } catch {
    $failure = $_.Exception.Message
    foreach ($name in @('OrderSawaDemoWeb','OrderSawaDemoApi')) {
      try { Assert-DemoAppServiceName $name; Stop-Service -Name $name -ErrorAction SilentlyContinue } catch {}
    }
    Write-JsonAtomic $activePath ($oldJson | ConvertFrom-Json)
    try {
      foreach ($name in @('OrderSawaDemoApi','OrderSawaDemoWeb')) { Assert-DemoAppServiceName $name; Start-Service -Name $name -ErrorAction Stop }
      throw "Activation failed ($failure); old pointer restored. Verify health before clearing maintenance."
    } catch { throw "Activation failed ($failure); old pointer restored, manual service/health check required. Maintenance flag remains." }
  }
} finally { $lock.Dispose() }
