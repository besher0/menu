param([switch]$ConfirmUninstall)
. (Join-Path $PSScriptRoot 'demo-common.ps1')
if (-not $ConfirmUninstall) { throw 'Explicit -ConfirmUninstall is required. Data, releases and secrets will be preserved.' }
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Administrator is required to unregister Windows services.' }
$p = Get-DemoPaths
$names = @(Get-DemoNames); [array]::Reverse($names)
foreach ($name in $names) {
  $service = Get-DemoService $name
  if (-not $service) { continue }
  if ($service.Status -ne 'Stopped') { Stop-Service -Name $name; (Get-Service $name).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(90)) }
  if ($name -eq 'OrderSawaDemoPostgres') {
    & (Join-Path $p.PgBin 'pg_ctl.exe') unregister -N $name
  } else {
    $wrapper = Join-Path (Join-Path $p.State 'services') "$name.exe"
    if (-not (Test-Path -LiteralPath $wrapper)) { throw "Wrapper for $name missing; refusing to delete an unverified service." }
    & $wrapper uninstall
  }
  if ($LASTEXITCODE -ne 0) { throw "Failed to unregister $name. Other state preserved." }
}
Write-Output 'Only named OrderSawa Demo services unregistered. Database files, backups, uploads, releases and token file were not deleted. Existing manual preview is not restarted automatically.'
