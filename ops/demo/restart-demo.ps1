. (Join-Path $PSScriptRoot 'demo-common.ps1')
Assert-DemoServiceSet
& (Join-Path $PSScriptRoot 'stop-demo.ps1')
& (Join-Path $PSScriptRoot 'start-demo.ps1')
