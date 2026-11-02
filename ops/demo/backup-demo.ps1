. (Join-Path $PSScriptRoot 'demo-common.ps1')
$p = Get-DemoPaths
$dir = Join-Path $p.Work 'ordersawa-demo-backups'
New-Item -ItemType Directory -Path $dir -Force | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$archive = Join-Path $dir "demo-before-update-$stamp.dump"
$pgDump = Join-Path $p.PgBin 'pg_dump.exe'
$pgRestore = Join-Path $p.PgBin 'pg_restore.exe'
& $pgDump -h 127.0.0.1 -p 55448 -U ordersawa_preview -d ordersawa_unified_interactive_preview -Fc -f $archive
if ($LASTEXITCODE -ne 0) { throw 'Demo pg_dump failed; update must not proceed.' }
$list = @(& $pgRestore -l $archive)
if ($LASTEXITCODE -ne 0 -or $list.Count -lt 20) { throw 'Demo backup archive failed validation; update must not proceed.' }
$uploads = Join-Path $p.State 'uploads'
if (-not (Test-Path -LiteralPath $uploads)) { $uploads = Join-Path $p.Repo 'apps\api\uploads' }
if (-not (Test-Path -LiteralPath $uploads -PathType Container)) { throw 'Demo upload source missing; update must not proceed.' }
$media = Join-Path $dir "uploads-before-update-$stamp"
Copy-Item -LiteralPath $uploads -Destination $media -Recurse
$originals = @(Get-ChildItem -LiteralPath $uploads -File -Recurse)
$copies = @(Get-ChildItem -LiteralPath $media -File -Recurse)
if ($originals.Count -ne $copies.Count) { throw 'Upload backup count mismatch; update must not proceed.' }
foreach ($original in $originals) {
  $relative = $original.FullName.Substring($uploads.Length).TrimStart('\')
  $copy = Join-Path $media $relative
  if (-not (Test-Path -LiteralPath $copy) -or (Get-FileHash -LiteralPath $original.FullName -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $copy -Algorithm SHA256).Hash) { throw "Upload backup hash mismatch: $relative" }
}
[pscustomobject]@{ Archive = $archive; Bytes = (Get-Item -LiteralPath $archive).Length; SHA256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash; UploadsCopy = $media }
