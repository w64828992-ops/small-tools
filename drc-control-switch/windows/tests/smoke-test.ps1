$ErrorActionPreference = 'Stop'
$toolRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$build = Join-Path $toolRoot 'scripts\build.ps1'
$out = Join-Path $toolRoot 'dist\windows'

powershell.exe -NoProfile -ExecutionPolicy Bypass -File $build
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }

foreach ($script in @(
    'launch.mjs',
    'background.mjs',
    'worker.mjs',
    'playwright-launch.mjs',
    'playwright-background.mjs'
)) {
    & (Join-Path $out 'node.exe') --check (Join-Path $out $script)
    if ($LASTEXITCODE -ne 0) { throw "Node syntax failed: $script" }
}

& (Join-Path $out 'node.exe') (Join-Path $out 'node_modules\@playwright\mcp\cli.js') --version
if ($LASTEXITCODE -ne 0) { throw 'Bundled Playwright MCP check failed.' }

Push-Location $out
try {
    $exe = Join-Path $out 'HuiyunComputerController.exe'
    $p = Start-Process -FilePath $exe -ArgumentList '--render' -PassThru -Wait
    if ($p.ExitCode -ne 0) { throw "UI render failed with exit code $($p.ExitCode)." }
    if (-not (Test-Path (Join-Path $out 'preview.png'))) { throw 'UI render preview missing.' }
} finally {
    Pop-Location
}

# Simulate an upgrade target that already has node_modules but is missing Playwright MCP.
# This verifies the installer merges bundled dependencies without touching live RDC state.
$tempTarget = Join-Path $env:TEMP 'drc-control-switch-install-upgrade-test'
if (Test-Path $tempTarget) { Remove-Item $tempTarget -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Join-Path $tempTarget 'node_modules\@wonderwhy-er\desktop-commander') | Out-Null
Set-Content -Path (Join-Path $tempTarget 'node_modules\@wonderwhy-er\desktop-commander\old-marker.txt') -Value 'old'
try {
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $toolRoot 'scripts\install-desktop.ps1') -Source $out -Target $tempTarget -SkipShortcut
    if ($LASTEXITCODE -ne 0) { throw 'Upgrade install simulation failed.' }
    if (-not (Test-Path (Join-Path $tempTarget 'node_modules\@playwright\mcp\package.json'))) {
        throw 'Upgrade install did not add bundled Playwright MCP.'
    }
    $sourceLock = (Get-FileHash (Join-Path $out 'package-lock.json') -Algorithm SHA256).Hash
    $targetLock = (Get-FileHash (Join-Path $tempTarget 'package-lock.json') -Algorithm SHA256).Hash
    if ($sourceLock -ne $targetLock) { throw 'Upgrade install package-lock mismatch.' }
} finally {
    if (Test-Path $tempTarget) { Remove-Item $tempTarget -Recurse -Force }
}

Write-Host 'SMOKE_TEST_OK'
Write-Host 'NOTE=No live RDC disconnect/reconnect was performed.'
