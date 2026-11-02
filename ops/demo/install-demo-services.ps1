param([string]$ReleaseId, [string]$TokenFile, [switch]$PreflightOnly, [switch]$ConfirmMaintenance)
. (Join-Path $PSScriptRoot 'demo-common.ps1')
$p = Get-DemoPaths
$wrapperSource = Join-Path $p.Tools 'WinSW-x64-v2.12.0.exe'
$expectedWrapperHash = '05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA'
if (-not (Test-Path -LiteralPath $wrapperSource -PathType Leaf) -or (Get-FileHash -LiteralPath $wrapperSource -Algorithm SHA256).Hash -ne $expectedWrapperHash) {
  throw 'Pinned WinSW v2.12.0 binary is missing or SHA-256 does not match. No installation attempted.'
}
if (-not (Test-Path -LiteralPath (Join-Path $p.PgBin 'pg_ctl.exe')) -or -not (Test-Path -LiteralPath $p.PgData) -or
    -not (Test-Path -LiteralPath 'C:\Program Files\nodejs\node.exe') -or
    -not (Test-Path -LiteralPath 'C:\Program Files (x86)\cloudflared\cloudflared.exe')) { throw 'A required Demo-only runtime is missing.' }
if (-not $ReleaseId) {
  $candidate = Get-ChildItem -LiteralPath (Join-Path $p.State 'releases') -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'release.json') } | Sort-Object Name -Descending | Select-Object -First 1
  if (-not $candidate) { throw 'No built Demo candidate exists. Run update-demo.ps1 -BuildOnly first.' }
  $ReleaseId = $candidate.Name
}
if ($ReleaseId -notmatch '^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$') { throw 'Invalid release ID.' }
$releasePath = Join-Path (Join-Path $p.State 'releases') $ReleaseId
$release = Get-Content -LiteralPath (Join-Path $releasePath 'release.json') -Raw | ConvertFrom-Json
if ($release.releaseId -ne $ReleaseId -or $release.sourceHash -ne $release.api.sourceHash -or
    $release.sourceHash -ne $release.web.sourceHash -or $release.tests.checkoutPostgres -ne 'passed') { throw 'Candidate is not fully tested or frontend/backend mismatch.' }
if (-not (Test-Path -LiteralPath (Join-Path $releasePath 'apps\api\dist\main.js')) -or
    -not (Test-Path -LiteralPath (Join-Path $releasePath 'apps\web\.next\BUILD_ID'))) { throw 'Candidate build artifacts missing.' }
$installedNames = @(Get-DemoNames | Where-Object { Get-DemoService $_ })
if ($installedNames.Count -eq 5 -and -not $PreflightOnly) {
  $alreadyActive = Read-DemoActive
  if ($alreadyActive.Active.releaseId -ne $ReleaseId) { throw 'Demo services are already installed with a different active release. Use update-demo.ps1.' }
  Write-Output "All five Demo services are already registered for $ReleaseId. No installation changes made. Use status-demo.ps1 to verify readiness."
  return
}
if ($installedNames.Count -gt 0 -and $installedNames.Count -lt 5 -and -not $PreflightOnly) {
  throw "Partial Demo service registration found: $($installedNames -join ', '). Review logs and use the authorized uninstall/recovery procedure before retrying."
}
$legacyLine = Get-Content -LiteralPath $p.LegacyApi | Where-Object { $_ -match '^\$env:DATABASE_URL\s*=' } | Select-Object -First 1
if ($legacyLine -notmatch "'([^']+)'" ) { throw 'Unable to read existing Demo database URL from the local legacy launcher.' }
$databaseUrl = $Matches[1]
Assert-DemoLoopbackDatabase $databaseUrl
if (-not $TokenFile) {
  $possible = @(Get-ChildItem -LiteralPath $env:LOCALAPPDATA -Filter 'ordersawa-rydtest-recovery-*' -Directory -ErrorAction SilentlyContinue |
    ForEach-Object { Join-Path $_.FullName 'cloudflared.token' } | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf -ErrorAction SilentlyContinue })
  if ($possible.Count -eq 1) { $TokenFile = $possible[0] }
}
$tokenVisible = [bool]($TokenFile -and (Test-Path -LiteralPath $TokenFile -PathType Leaf))
$listeners = @(Get-DemoListeners)
$occupied = @($listeners | Where-Object { $_.Port -in @(5001,3102,3210) } |
  ForEach-Object { "$($_.Port)/PID$($_.PID)" })
$postgresListeners = @($listeners | Where-Object { $_.Port -eq 55448 })
$pidFile = Join-Path $p.PgData 'postmaster.pid'
$postgresOwned = $postgresListeners.Count -eq 0
if ($postgresListeners.Count -eq 1 -and (Test-Path -LiteralPath $pidFile -PathType Leaf)) {
  $pidLines = @(Get-Content -LiteralPath $pidFile -TotalCount 4)
  $expectedData = [IO.Path]::GetFullPath($p.PgData).TrimEnd('\').Replace('\','/')
  $pidData = $pidLines[1].TrimEnd('\').Replace('\','/')
  $postgresOwned = $pidLines.Count -eq 4 -and $pidLines[0] -eq [string]$postgresListeners[0].PID -and
    $pidLines[3] -eq '55448' -and $pidData -eq $expectedData
}
$oldTunnel = @(Get-Process -Name cloudflared -ErrorAction SilentlyContinue)
$manager = Join-Path $p.State 'manager'; $serviceDir = Join-Path $p.State 'services'
$secretDir = Join-Path $p.State 'secrets'; $logDir = Join-Path $p.State 'logs'; $uploads = Join-Path $p.State 'uploads'
function New-DemoServiceXml([string]$name, [string]$role) {
  $args = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + (Join-Path $manager 'launch-demo.ps1') + '" -Role ' + $role
  $dependencies = switch ($role) {
    'api' { @('OrderSawaDemoPostgres') }
    # The launcher waits for its loopback upstreams. SCM dependencies here would
    # prevent a Web/API-only update while the proxy and tunnel stay running.
    'web' { @() }
    'proxy' { @() }
    'tunnel' { @('OrderSawaDemoProxy') }
  }
  $dependencyXml = ($dependencies | ForEach-Object { '  <depend>' + $_ + '</depend>' }) -join "`n"
  $safeArgs = [Security.SecurityElement]::Escape($args)
  $safeManager = [Security.SecurityElement]::Escape($manager)
  $safeState = [Security.SecurityElement]::Escape($p.State)
  $safeLogs = [Security.SecurityElement]::Escape($logDir)
  $xml = @"
<service>
  <id>$name</id><name>$name</name><description>OrderSawa Demo $role only</description>
  <executable>C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe</executable>
  <arguments>$safeArgs</arguments>
  <workingdirectory>$safeManager</workingdirectory>
  <env name="ORDERSAWA_DEMO_STATE_ROOT" value="$safeState" />
  <startmode>Automatic</startmode><delayedAutoStart>true</delayedAutoStart>
$dependencyXml
  <serviceaccount><username>NT AUTHORITY\LocalService</username></serviceaccount>
  <logpath>$safeLogs</logpath>
  <log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>5</keepFiles></log>
  <onfailure action="restart" delay="15 sec" />
</service>
"@
  [xml]$xml | Out-Null
  return $xml
}
if ($PreflightOnly) {
  $previewDir = Join-Path $p.State 'install-preview'
  New-Item -ItemType Directory -Path $previewDir -Force | Out-Null
  foreach ($item in @(@('Api','api'),@('Web','web'),@('Proxy','proxy'),@('Tunnel','tunnel'))) {
    $name = "OrderSawaDemo$($item[0])"
    [IO.File]::WriteAllText((Join-Path $previewDir "$name.xml"),(New-DemoServiceXml $name $item[1]),[Text.UTF8Encoding]::new($false))
  }
  [pscustomobject]@{ Candidate=$ReleaseId; Database='127.0.0.1:55448/ordersawa_unified_interactive_preview'; TokenVisible=$tokenVisible;
    OccupiedPreviewPorts=($occupied -join ', '); PostgresListener=($postgresListeners | ForEach-Object { "55448/PID$($_.PID)" }) -join ', '; PostgresOwned=$postgresOwned;
    ManualTunnelProcesses=$oldTunnel.Count; ConfigPreview=$previewDir; ConfigValidated=$true; Administrator=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator);
    SecurityReady=$false; SecurityBlockers='Release/state ACLs remain writable by the Codex sandbox; API and tunnel share LocalService secret access; no owner-approved protected release activator exists.';
    SafeToInstall=$false }
  return
}
if (-not $ConfirmMaintenance) { throw 'Installation requires -ConfirmMaintenance after owner approval and an agreed maintenance window.' }
throw 'Security gate: installation is disabled until release/state ACL isolation, per-service secret access, and an owner-approved protected activation path are implemented and tested. Do not bypass this guard or delegate service control to CodexSandboxUsers.'
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run this reviewed installer once from an elevated PowerShell window. No permanent Codex elevation required.' }
if (-not $tokenVisible) { throw 'Owner token file not visible. Do not paste it into chat.' }
if ($occupied.Count -or $oldTunnel.Count) { throw 'Old preview processes still active. Close only their known owner terminals before installation; this installer never kills arbitrary PIDs.' }
if (-not $postgresOwned) { throw 'Port 55448 is not proved to belong to the expected Demo PostgreSQL data directory. No process will be stopped.' }
$backup = Get-ChildItem -LiteralPath (Join-Path $p.Work 'ordersawa-demo-backups') -Filter '*.dump' -ErrorAction SilentlyContinue | Where-Object { $_.Length -gt 0 } | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
if (-not $backup) { throw 'Verified Demo backup missing.' }
$backupList = @(& (Join-Path $p.PgBin 'pg_restore.exe') -l $backup.FullName)
if ($LASTEXITCODE -ne 0 -or $backupList.Count -lt 20) { throw 'Most recent Demo backup archive cannot be listed; installation refused.' }
& (Join-Path $PSScriptRoot 'backup-demo.ps1') | Out-Host
foreach ($dir in @($manager,$serviceDir,$secretDir,$logDir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
if (-not (Test-Path -LiteralPath $uploads)) {
  $sourceUploads = Join-Path $p.Repo 'apps\api\uploads'
  Copy-Item -LiteralPath $sourceUploads -Destination $uploads -Recurse
  $sourceFiles = @(Get-ChildItem -LiteralPath $sourceUploads -File -Recurse)
  $copiedFiles = @(Get-ChildItem -LiteralPath $uploads -File -Recurse)
  if ($sourceFiles.Count -ne $copiedFiles.Count) { throw 'Upload copy count mismatch; no services registered.' }
  foreach ($sourceFile in $sourceFiles) {
    $relative = $sourceFile.FullName.Substring($sourceUploads.Length).TrimStart('\')
    $copy = Join-Path $uploads $relative
    if (-not (Test-Path -LiteralPath $copy) -or (Get-FileHash -LiteralPath $sourceFile.FullName -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $copy -Algorithm SHA256).Hash) { throw "Upload copy hash mismatch: $relative" }
  }
}
$owner = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$backupDir = Join-Path $p.Work 'ordersawa-demo-backups'
& icacls.exe $backupDir /inheritance:r /grant:r "${owner}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to protect Demo backup directory ACL.' }
& icacls.exe $p.State /grant '*S-1-5-19:(OI)(CI)RX' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to grant LocalService read access to Demo releases.' }
& icacls.exe $p.PgBin /grant '*S-1-5-19:(OI)(CI)RX' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to grant LocalService read access to PostgreSQL binaries.' }
& icacls.exe $logDir /grant '*S-1-5-19:(OI)(CI)M' | Out-Null
& icacls.exe $uploads /grant '*S-1-5-19:(OI)(CI)M' | Out-Null
& icacls.exe $p.PgData /grant '*S-1-5-19:(OI)(CI)M' /T | Out-Null
& icacls.exe $secretDir /inheritance:r /grant:r "${owner}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-19:(OI)(CI)RX' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to protect Demo secret directory ACL.' }
$secretsPath = Join-Path $secretDir 'demo-secrets.json'
if (-not (Test-Path -LiteralPath $secretsPath)) {
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $jwt = New-Object byte[] 32; $hmac = New-Object byte[] 64
    $rng.GetBytes($jwt); $rng.GetBytes($hmac)
    $secrets = @{ databaseUrl=$databaseUrl; jwtSecret=([BitConverter]::ToString($jwt)).Replace('-','').ToLowerInvariant(); checkoutHmacKey=([BitConverter]::ToString($hmac)).Replace('-','').ToLowerInvariant() }
    [IO.File]::WriteAllText($secretsPath,($secrets | ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
  } finally { $rng.Dispose() }
}
$existing = Get-Content -LiteralPath $secretsPath -Raw | ConvertFrom-Json
Assert-DemoLoopbackDatabase $existing.databaseUrl
if ($existing.jwtSecret.Length -lt 32 -or $existing.checkoutHmacKey -notmatch '^[0-9a-f]{64,}$') { throw 'Existing stable Demo secrets invalid.' }
$protectedToken = Join-Path $secretDir 'cloudflared.token'
if (-not (Test-Path -LiteralPath $protectedToken)) { Copy-Item -LiteralPath $TokenFile -Destination $protectedToken }
if ((Get-Item -LiteralPath $protectedToken).Length -lt 20 -or
    (Get-FileHash -LiteralPath $protectedToken -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $TokenFile -Algorithm SHA256).Hash) {
  throw 'Protected tunnel token file is empty/incomplete or differs from the owner source; no services registered.'
}
foreach ($file in @($secretsPath,$protectedToken)) { & icacls.exe $file /inheritance:r /grant:r "${owner}:F" '*S-1-5-18:F' '*S-1-5-32-544:F' '*S-1-5-19:R' | Out-Null; if ($LASTEXITCODE -ne 0) { throw 'Secret file ACL failed.' } }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'launch-demo.ps1') -Destination (Join-Path $manager 'launch-demo.ps1') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'proxy.cjs') -Destination (Join-Path $manager 'proxy.cjs') -Force
$activePath = Join-Path $p.State 'active.json'
if (-not (Test-Path -LiteralPath $activePath)) {
  $pointer = @{schemaVersion=1;releaseId=$ReleaseId;sourceHash=$release.sourceHash;activatedAtUtc=(Get-Date).ToUniversalTime().ToString('o')}
  [IO.File]::WriteAllText($activePath,($pointer | ConvertTo-Json),[Text.UTF8Encoding]::new($false))
}
if ($postgresListeners.Count -eq 1) {
  & (Join-Path $p.PgBin 'pg_ctl.exe') stop -D $p.PgData -m fast -w -t 60
  if ($LASTEXITCODE -ne 0 -or @(Get-DemoListeners | Where-Object { $_.Port -eq 55448 }).Count -ne 0) {
    throw 'Expected Demo PostgreSQL did not stop cleanly; no services registered.'
  }
}
$pgService = 'OrderSawaDemoPostgres'
if (-not (Get-DemoService $pgService)) {
  & (Join-Path $p.PgBin 'pg_ctl.exe') register -N $pgService -D $p.PgData -S auto -U 'NT AUTHORITY\LocalService' -o '-h 127.0.0.1 -p 55448'
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL service registration failed. Inspect service account support before retry.' }
  & sc.exe failure $pgService 'reset= 86400' 'actions= restart/60000/restart/60000/restart/60000' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL service recovery policy could not be registered.' }
}
foreach ($item in @(@('Api','api'),@('Web','web'),@('Proxy','proxy'),@('Tunnel','tunnel'))) {
  $name = "OrderSawaDemo$($item[0])"; $role=$item[1]
  $binary = Join-Path $serviceDir "$name.exe"; $xmlFile = Join-Path $serviceDir "$name.xml"
  if (-not (Test-Path -LiteralPath $binary)) { Copy-Item -LiteralPath $wrapperSource -Destination $binary }
  if ((Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash -ne $expectedWrapperHash) { throw "Wrapper checksum mismatch for $name" }
  $xml = New-DemoServiceXml $name $role
  [xml]$xml | Out-Null
  [IO.File]::WriteAllText($xmlFile,$xml,[Text.UTF8Encoding]::new($false))
  if (-not (Get-DemoService $name)) { & $binary install; if ($LASTEXITCODE -ne 0) { throw "Service registration failed for $name" } }
}
& (Join-Path $PSScriptRoot 'start-demo.ps1')
Write-Output "Demo services installed and started on release $ReleaseId. Check external Access from an authorized device."
