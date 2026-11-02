Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-DemoPaths {
  $repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
  $outer = Split-Path $repo -Parent
  $work = Join-Path $outer 'work'
  [pscustomobject]@{
    Repo = $repo
    Work = $work
    State = Join-Path $work 'ordersawa-demo-state'
    Tools = Join-Path $work 'demo-ops-tools'
    PgBin = Join-Path $work 'stage6f3-pg18\pgsql\bin'
    PgData = Join-Path $work 'ordersawa-unified-preview-pg18-data'
    LegacyApi = Join-Path $work 'start-rydtest-api.ps1'
  }
}

function Get-DemoNames {
  @('OrderSawaDemoPostgres', 'OrderSawaDemoApi', 'OrderSawaDemoWeb', 'OrderSawaDemoProxy', 'OrderSawaDemoTunnel')
}

function Get-DemoService([string]$name) {
  if ($name -notin (Get-DemoNames)) { throw "Unexpected service name: $name" }
  Get-Service -Name $name -ErrorAction SilentlyContinue
}

function Assert-DemoLoopbackDatabase([string]$url) {
  $uri = [uri]$url
  if ($uri.Scheme -notin @('postgresql','postgres') -or $uri.Host -notin @('127.0.0.1','localhost') -or
      $uri.Port -ne 55448 -or $uri.AbsolutePath.TrimStart('/') -ne 'ordersawa_unified_interactive_preview') {
    throw 'Refusing a database URL other than the verified loopback Demo database.'
  }
}

function Read-DemoActive {
  $p = Get-DemoPaths
  $path = Join-Path $p.State 'active.json'
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'No active Demo release manifest. Installation has not been activated.' }
  $active = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
  if ($active.schemaVersion -ne 1 -or $active.releaseId -notmatch '^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$' -or
      $active.sourceHash -notmatch '^[0-9a-f]{64}$') { throw 'Invalid active Demo manifest.' }
  $releasePath = Join-Path (Join-Path $p.State 'releases') $active.releaseId
  if (-not (Test-Path -LiteralPath (Join-Path $releasePath 'release.json') -PathType Leaf)) { throw 'Active release files are missing.' }
  $release = Get-Content -LiteralPath (Join-Path $releasePath 'release.json') -Raw | ConvertFrom-Json
  if ($release.releaseId -ne $active.releaseId -or $release.sourceHash -ne $active.sourceHash -or
      $release.web.sourceHash -ne $active.sourceHash -or $release.api.sourceHash -ne $active.sourceHash) {
    throw 'Frontend/backend release manifest mismatch.'
  }
  [pscustomobject]@{ Active = $active; Release = $release; Path = $releasePath }
}

function Write-DemoActiveAtomic([string]$state, [string]$json) {
  $pointer = $json | ConvertFrom-Json
  if ($pointer.schemaVersion -ne 1 -or $pointer.releaseId -notmatch '^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$' -or
      $pointer.sourceHash -notmatch '^[0-9a-f]{64}$') { throw 'Invalid active Demo pointer; no change made.' }
  $activePath = Join-Path $state 'active.json'
  if (-not (Test-Path -LiteralPath $activePath -PathType Leaf)) { throw 'Active pointer is missing; no change made.' }
  $temporary = Join-Path $state ('active-' + [guid]::NewGuid().ToString('N') + '.tmp')
  $backup = Join-Path $state ('active-backup-' + [guid]::NewGuid().ToString('N') + '.tmp')
  try {
    [IO.File]::WriteAllText($temporary,$json,[Text.UTF8Encoding]::new($false))
    [IO.File]::Replace($temporary,$activePath,$backup)
    Remove-Item -LiteralPath $backup
  } finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary }
  }
}

function Test-DemoEndpoint([string]$uri, [string]$releaseId, [int]$timeout = 5) {
  try {
    $response = Invoke-WebRequest -Uri $uri -Headers @{ Host = 'rydtest.ordersawa.com' } -UseBasicParsing -TimeoutSec $timeout
    $servedId = @($response.Headers['X-OrderSawa-Release'])[0]
    return ($response.StatusCode -eq 200 -and $servedId -eq $releaseId)
  } catch { return $false }
}

function Wait-DemoEndpoint([string]$uri, [string]$releaseId, [int]$seconds = 90) {
  $until = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $until) {
    if (Test-DemoEndpoint $uri $releaseId 3) { return }
    Start-Sleep -Seconds 2
  }
  throw "Demo endpoint did not become ready: $uri"
}

function Assert-DemoServiceSet {
  $missing = @(Get-DemoNames | Where-Object { -not (Get-DemoService $_) })
  if ($missing.Count) { throw "Demo services are not installed: $($missing -join ', ')" }
}

function Assert-DemoPortOwnership([int[]]$ports) {
  $listening = @(Get-DemoListeners | Where-Object { $_.Port -in $ports })
  if ($listening.Count) {
    $labels = $listening | ForEach-Object { "$($_.Port)/PID$($_.PID)" }
    throw "Demo ports already occupied: $($labels -join ', '). Do not terminate these PIDs automatically."
  }
}

function Get-DemoListeners {
  $lines = @(netstat.exe -ano -p tcp)
  if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect local TCP listeners safely.' }
  foreach ($line in $lines) {
    if ($line -match '^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$') {
      [pscustomobject]@{ Port = [int]$Matches[1]; PID = [int]$Matches[2] }
    }
  }
}
