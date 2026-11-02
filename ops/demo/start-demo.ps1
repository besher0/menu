. (Join-Path $PSScriptRoot 'demo-common.ps1')
Assert-DemoServiceSet
$active = Read-DemoActive
$id = $active.Active.releaseId
foreach ($name in Get-DemoNames) {
  $service = Get-DemoService $name
  if ($service.Status -ne 'Running') { Start-Service -Name $name; (Get-Service -Name $name).WaitForStatus('Running',[TimeSpan]::FromSeconds(90)) }
  switch ($name) {
    'OrderSawaDemoApi' { Wait-DemoEndpoint 'http://127.0.0.1:5001/health' $id 120 }
    'OrderSawaDemoWeb' { Wait-DemoEndpoint 'http://127.0.0.1:3102/login' $id 120 }
    'OrderSawaDemoProxy' { Wait-DemoEndpoint 'http://127.0.0.1:3210/__demo/version' $id 120 }
  }
}
Write-Output "Demo services running on release $id. Tunnel external Access must still be checked separately."
