. (Join-Path $PSScriptRoot 'demo-common.ps1')
Assert-DemoServiceSet
$names = @(Get-DemoNames)
[array]::Reverse($names)
foreach ($name in $names) {
  $service = Get-DemoService $name
  if ($service.Status -ne 'Stopped') { Stop-Service -Name $name; (Get-Service -Name $name).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(90)) }
}
Write-Output 'Only the five named OrderSawa Demo services were stopped. Demo data and releases remain intact.'
