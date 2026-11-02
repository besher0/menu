param([Parameter(Mandatory)][string]$ReleaseId)
. (Join-Path $PSScriptRoot 'demo-common.ps1')
$p = Get-DemoPaths
if ($ReleaseId -notmatch '^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$') { throw 'Invalid candidate release ID.' }
$releasePath = Join-Path (Join-Path $p.State 'releases') $ReleaseId
$manifest = Get-Content -LiteralPath (Join-Path $releasePath 'release.json') -Raw | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1 -or $manifest.releaseId -ne $ReleaseId -or $manifest.sourceHash -notmatch '^[0-9a-f]{64}$' -or
    $manifest.api.sourceHash -ne $manifest.sourceHash -or $manifest.web.sourceHash -ne $manifest.sourceHash -or
    $manifest.tests.checkoutPostgres -ne 'passed') { throw 'Candidate release manifest does not pass validation.' }
foreach ($artifact in @('apps\api\dist\main.js','apps\web\.next\BUILD_ID')) {
  if (-not (Test-Path -LiteralPath (Join-Path $releasePath $artifact) -PathType Leaf)) { throw "Missing artifact: $artifact" }
}
$testDir = Join-Path (Join-Path $p.State 'test-runs') ('manifest-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testDir | Out-Null
$first = @{schemaVersion=1;releaseId=$ReleaseId;sourceHash=$manifest.sourceHash} | ConvertTo-Json
$second = @{schemaVersion=1;releaseId='20261101T230000Z-aaaaaaaaaaaa';sourceHash=('a'*64)} | ConvertTo-Json
$activePath = Join-Path $testDir 'active.json'
try {
  [IO.File]::WriteAllText($activePath,$first,[Text.UTF8Encoding]::new($false))
  Write-DemoActiveAtomic $testDir $second
  if ((Get-Content -LiteralPath $activePath -Raw | ConvertFrom-Json).releaseId -ne '20261101T230000Z-aaaaaaaaaaaa') { throw 'Atomic switch failed.' }
  Write-DemoActiveAtomic $testDir $first
  if ((Get-Content -LiteralPath $activePath -Raw | ConvertFrom-Json).releaseId -ne $ReleaseId) { throw 'Isolated rollback failed.' }
  Write-Output "Candidate manifest and isolated pointer switch/rollback passed: $ReleaseId"
} finally {
  if (([IO.Path]::GetFullPath($testDir)).StartsWith(([IO.Path]::GetFullPath((Join-Path $p.State 'test-runs'))) + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $activePath -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $testDir -ErrorAction SilentlyContinue
  }
}
