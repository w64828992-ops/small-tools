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

Write-Host 'SMOKE_TEST_OK'
Write-Host 'NOTE=No live RDC disconnect/reconnect was performed.'
