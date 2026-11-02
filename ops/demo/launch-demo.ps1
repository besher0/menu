param([ValidateSet('api','web','proxy','tunnel')][string]$Role)
$ErrorActionPreference = 'Stop'
$state = $env:ORDERSAWA_DEMO_STATE_ROOT
if (-not $state -or -not (Test-Path -LiteralPath $state -PathType Container)) { throw 'Demo state directory is unavailable.' }
$activePath = Join-Path $state 'active.json'
$active = Get-Content -LiteralPath $activePath -Raw | ConvertFrom-Json
if ($active.releaseId -notmatch '^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$') { throw 'Invalid active release ID.' }
$release = Join-Path (Join-Path $state 'releases') $active.releaseId
$manifest = Get-Content -LiteralPath (Join-Path $release 'release.json') -Raw | ConvertFrom-Json
if ($manifest.releaseId -ne $active.releaseId -or $manifest.sourceHash -ne $active.sourceHash) { throw 'Manifest mismatch.' }
$env:ORDERSAWA_RELEASE_ID = $active.releaseId
$node = 'C:\Program Files\nodejs\node.exe'
if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { throw 'Node.js runtime missing.' }
function Wait-Port([int]$port) {
  $until = (Get-Date).AddSeconds(120)
  while ((Get-Date) -lt $until) {
    try { $tcp = New-Object Net.Sockets.TcpClient('127.0.0.1',$port); $tcp.Close(); return } catch { Start-Sleep -Seconds 2 }
  }
  throw "Dependency on loopback port $port is not ready."
}
switch ($Role) {
  'api' {
    Wait-Port 55448
    $secrets = Get-Content -LiteralPath (Join-Path $state 'secrets\demo-secrets.json') -Raw | ConvertFrom-Json
    $u = [uri]$secrets.databaseUrl
    if ($u.Host -notin @('127.0.0.1','localhost') -or $u.Port -ne 55448 -or $u.AbsolutePath.TrimStart('/') -ne 'ordersawa_unified_interactive_preview') { throw 'Non-Demo database rejected.' }
    $env:DATABASE_URL = $secrets.databaseUrl
    $env:JWT_SECRET = $secrets.jwtSecret
    $env:PUBLIC_WHATSAPP_CHECKOUT_HMAC_KEY = $secrets.checkoutHmacKey
    $env:ENABLE_PUBLIC_NETWORK_WHATSAPP_CHECKOUT = '1'
    $env:ORDERSAWA_DEMO_UPLOADS_DIR = Join-Path $state 'uploads'
    $env:NODE_ENV = 'production'; $env:PORT = '5001'; $env:API_HOST = '127.0.0.1'
    $env:WEB_ORIGIN = 'https://rydtest.ordersawa.com'; $env:API_ORIGIN = 'http://127.0.0.1:5001'
    $env:CORS_ORIGINS = 'https://rydtest.ordersawa.com'
    Set-Location (Join-Path $release 'apps\api')
    & $node 'dist\main.js'
  }
  'web' {
    Wait-Port 5001
    $env:NODE_ENV = 'production'; $env:NEXT_PUBLIC_API_URL = '/api'
    $env:ORDERSAWA_PREVIEW_INTERNAL_API_URL = 'http://127.0.0.1:5001'
    Set-Location (Join-Path $release 'apps\web')
    & $node (Join-Path $release 'node_modules\next\dist\bin\next') start -p 3102 -H 127.0.0.1
  }
  'proxy' {
    Wait-Port 5001; Wait-Port 3102
    & $node (Join-Path $state 'manager\proxy.cjs')
  }
  'tunnel' {
    Wait-Port 3210
    $cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
    $tokenFile = Join-Path $state 'secrets\cloudflared.token'
    if (-not (Test-Path -LiteralPath $cloudflared -PathType Leaf) -or -not (Test-Path -LiteralPath $tokenFile -PathType Leaf)) { throw 'Tunnel executable or protected token file unavailable.' }
    & $cloudflared tunnel --loglevel warn run --token-file $tokenFile
  }
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
throw "$Role exited unexpectedly; service recovery will retry."
