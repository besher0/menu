Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:DemoServiceNames = @('OrderSawaDemoPostgres','OrderSawaDemoApi','OrderSawaDemoWeb','OrderSawaDemoProxy','OrderSawaDemoTunnel')
$script:ProtectedDemoRoot = 'C:\Program Files\OrderSawaDemo'

function Assert-ReleaseId([string]$value) {
  if ($value -notmatch '^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$') { throw 'Invalid Demo release ID.' }
}

function Assert-Sha256([string]$value) {
  if ($value -cnotmatch '^[0-9A-Fa-f]{64}$') { throw 'An explicit 64-character SHA-256 approval is required.' }
}

function Assert-DemoServiceName([string]$name) {
  if ($name -cnotin $script:DemoServiceNames) { throw "Service outside OrderSawa Demo allowlist: $name" }
}

function Assert-DemoAppServiceName([string]$name) {
  if ($name -cnotin @('OrderSawaDemoApi','OrderSawaDemoWeb')) { throw "Only OrderSawa Demo API/Web can be updated: $name" }
}

function Assert-ChildPath([string]$parent, [string]$child) {
  $p = [IO.Path]::GetFullPath($parent).TrimEnd('\') + '\'
  $c = [IO.Path]::GetFullPath($child)
  if (-not $c.StartsWith($p,[StringComparison]::OrdinalIgnoreCase)) { throw 'Path escapes its approved Demo directory.' }
}

function Get-TreeDigest([string]$directory) {
  if (-not (Test-Path -LiteralPath $directory -PathType Container)) { throw 'Release directory missing.' }
  $files = @(Get-ChildItem -LiteralPath $directory -File -Recurse -Force | Sort-Object { $_.FullName.Substring($directory.Length).Replace('\','/') })
  if ($files.Count -lt 2) { throw 'Release directory is incomplete.' }
  $rows = foreach ($file in $files) {
    if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Release cannot contain reparse points.' }
    $relative = $file.FullName.Substring($directory.TrimEnd('\').Length).TrimStart('\').Replace('\','/')
    "$relative $((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant())"
  }
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $data = [Text.Encoding]::UTF8.GetBytes(($rows -join "`n"))
    return ([BitConverter]::ToString($sha.ComputeHash($data))).Replace('-','').ToLowerInvariant()
  } finally { $sha.Dispose() }
}

function Read-PackageManifest([string]$archive) {
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [IO.Compression.ZipFile]::OpenRead($archive)
  try {
    $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $manifestEntry = $null
    foreach ($entry in $zip.Entries) {
      $name = $entry.FullName.Replace('\','/')
      if (-not $name -or $name.StartsWith('/') -or $name -match '(^|/)\.\.(/|$)|:|[\x00-\x1f]' -or -not $seen.Add($name)) { throw 'Unsafe or duplicate package path.' }
      if ($name -eq 'release.json') { $manifestEntry = $entry }
    }
    if (-not $manifestEntry) { throw 'Package release.json missing.' }
    $reader = [IO.StreamReader]::new($manifestEntry.Open(),[Text.Encoding]::UTF8)
    try { $manifest = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
    Assert-ReleaseId $manifest.releaseId
    Assert-Sha256 $manifest.sourceHash
    if ($manifest.schemaVersion -ne 1 -or $manifest.api.sourceHash -ne $manifest.sourceHash -or
        $manifest.web.sourceHash -ne $manifest.sourceHash -or $manifest.tests.build -ne 'passed' -or
        $manifest.tests.typecheck -ne 'passed' -or $manifest.tests.shared -ne 'passed' -or
        $manifest.tests.web -ne 'passed' -or $manifest.tests.checkoutPostgres -ne 'passed') {
      throw 'Package is not a fully tested matching Web/API candidate.'
    }
    foreach ($required in @('apps/api/dist/main.js','apps/web/.next/BUILD_ID','apps/api/prisma/schema.prisma')) {
      if (-not $seen.Contains($required)) { throw "Package artifact missing: $required" }
    }
    return $manifest
  } finally { $zip.Dispose() }
}

function Get-ProtectedConfig {
  $path = Join-Path $script:ProtectedDemoRoot 'manager\settings.json'
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Protected Demo manager is not installed.' }
  $config = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
  if ($config.schemaVersion -ne 1 -or $config.root -ne $script:ProtectedDemoRoot -or
      $config.candidatePackages -notmatch '\\ordersawa-demo-state\\packages$' -or
      $config.ownerSid -notmatch '^S-1-5-21-[0-9-]+$') { throw 'Protected manager configuration invalid.' }
  return $config
}

function Assert-Owner([object]$config) {
  $current = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  if ($current -ne $config.ownerSid) { throw 'Only the designated owner account can approve a Demo release.' }
}

function Get-PublishedIndex([string]$root) {
  $path = Join-Path $root 'release-index.json'
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Protected release index missing.' }
  return (Get-Content -LiteralPath $path -Raw | ConvertFrom-Json)
}

function Assert-PublishedRelease([string]$root, [string]$id) {
  Assert-ReleaseId $id
  $index = Get-PublishedIndex $root
  $entry = @($index.releases | Where-Object { $_.releaseId -ceq $id })
  if ($entry.Count -ne 1) { throw 'Release is not in protected publication index.' }
  Assert-Sha256 $entry[0].archiveSha256
  Assert-Sha256 $entry[0].treeSha256
  $releasePath = Join-Path (Join-Path $root 'releases') $id
  Assert-ChildPath (Join-Path $root 'releases') $releasePath
  if ((Get-TreeDigest $releasePath) -ne $entry[0].treeSha256.ToLowerInvariant()) { throw 'Published release changed after approval.' }
  return [pscustomobject]@{ Path=$releasePath; Entry=$entry[0] }
}

function Write-JsonAtomic([string]$path, [object]$value) {
  $parent = Split-Path $path -Parent
  $temp = Join-Path $parent ('.write-' + [guid]::NewGuid().ToString('N'))
  $json = $value | ConvertTo-Json -Depth 12
  try {
    [IO.File]::WriteAllText($temp,$json,[Text.UTF8Encoding]::new($false))
    if (Test-Path -LiteralPath $path) { [IO.File]::Replace($temp,$path,$null) }
    else { [IO.File]::Move($temp,$path) }
  } finally { if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp } }
}
