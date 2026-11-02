param([Parameter(Mandatory)][string]$ReleaseId)
. (Join-Path $PSScriptRoot 'demo-common.ps1')
. (Join-Path $PSScriptRoot 'secure\secure-common.ps1')
Assert-ReleaseId $ReleaseId
$p = Get-DemoPaths
$candidate = Join-Path (Join-Path $p.State 'releases') $ReleaseId
Assert-ChildPath (Join-Path $p.State 'releases') $candidate
if (-not (Test-Path -LiteralPath $candidate -PathType Container)) { throw 'Built candidate does not exist.' }
$manifest = Get-Content -LiteralPath (Join-Path $candidate 'release.json') -Raw | ConvertFrom-Json
if ($manifest.releaseId -cne $ReleaseId -or $manifest.tests.checkoutPostgres -ne 'passed') { throw 'Candidate has not passed PostgreSQL integration.' }
$packages = Join-Path $p.State 'packages'
New-Item -ItemType Directory -Path $packages -Force | Out-Null
$archive = Join-Path $packages "$ReleaseId.zip"
if (Test-Path -LiteralPath $archive) { throw 'Package already exists. Build a new release instead of overwriting an approval candidate.' }
$temp = Join-Path $packages ('.package-' + [guid]::NewGuid().ToString('N') + '.zip')
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
try {
  $zip = [IO.Compression.ZipFile]::Open($temp,[IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($file in (Get-ChildItem -LiteralPath $candidate -File -Recurse -Force | Sort-Object FullName)) {
      if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Candidate contains reparse point.' }
      $name = $file.FullName.Substring($candidate.Length).TrimStart('\').Replace('\','/')
      [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$file.FullName,$name,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
  } finally { $zip.Dispose() }
  $info = Read-PackageManifest $temp
  if ($info.releaseId -ne $ReleaseId) { throw 'Packaged release ID differs from candidate.' }
  [IO.File]::Move($temp,$archive)
  [pscustomobject]@{ ReleaseId=$ReleaseId; Package=$archive; Sha256=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash; Bytes=(Get-Item -LiteralPath $archive).Length; Approval='Owner must review candidate and approve this exact SHA-256 outside Codex; not auto-activated.' }
} finally { if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp } }
