param([Parameter(Mandatory)][string]$Root)
. (Join-Path $PSScriptRoot 'secure-common.ps1')
if ($Root -cne $script:ProtectedDemoRoot) { throw 'Only protected OrderSawa Demo root may be backed up.' }
$config = Get-ProtectedConfig
Assert-Owner $config
$backupDir = Join-Path $Root 'backups'
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$archive = Join-Path $backupDir "demo-$stamp.dump"
$dump = Join-Path $Root 'pg-bin\pg_dump.exe'
$restore = Join-Path $Root 'pg-bin\pg_restore.exe'
& $dump -h 127.0.0.1 -p 55448 -U ordersawa_preview -d ordersawa_unified_interactive_preview -Fc -f $archive
if ($LASTEXITCODE -ne 0) { throw 'Protected Demo pg_dump failed.' }
$list = @(& $restore -l $archive)
if ($LASTEXITCODE -ne 0 -or $list.Count -lt 20) { throw 'Protected backup archive cannot be listed.' }
$uploads = Join-Path $Root 'uploads'
$copy = Join-Path $backupDir "uploads-$stamp"
Copy-Item -LiteralPath $uploads -Destination $copy -Recurse
$sources = @(Get-ChildItem -LiteralPath $uploads -File -Recurse)
$copied = @(Get-ChildItem -LiteralPath $copy -File -Recurse)
if ($sources.Count -ne $copied.Count) { throw 'Protected upload backup count mismatch.' }
foreach ($item in $sources) {
  $relative = $item.FullName.Substring($uploads.Length).TrimStart('\')
  $target = Join-Path $copy $relative
  if ((Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash) { throw 'Protected upload backup hash mismatch.' }
}
[pscustomobject]@{ Archive=$archive; Bytes=(Get-Item -LiteralPath $archive).Length; UploadCount=$sources.Count }
