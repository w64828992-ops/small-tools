param(
    [string]$Source = (Join-Path $PSScriptRoot '..\dist\windows'),
    [string]$Target = (Join-Path $env:USERPROFILE 'Desktop\Codex\RemoteDesktopCommander')
)

$ErrorActionPreference = 'Stop'
$Source = (Resolve-Path $Source).Path
New-Item -ItemType Directory -Force -Path $Target | Out-Null

foreach ($name in @(
    'HuiyunComputerController.exe',
    'launch.mjs',
    'background.mjs',
    'worker.mjs',
    'playwright-launch.mjs',
    'playwright-background.mjs',
    'package.json',
    'package-lock.json'
)) {
    Copy-Item (Join-Path $Source $name) (Join-Path $Target $name) -Force
}

if (-not (Test-Path (Join-Path $Target 'node.exe'))) {
    Copy-Item (Join-Path $Source 'node.exe') (Join-Path $Target 'node.exe')
}
if (-not (Test-Path (Join-Path $Target 'node_modules'))) {
    Copy-Item (Join-Path $Source 'node_modules') (Join-Path $Target 'node_modules') -Recurse
}

if (-not (Test-Path (Join-Path $Target 'desired.txt'))) {
    Set-Content (Join-Path $Target 'desired.txt') 'off' -NoNewline
}
if (-not (Test-Path (Join-Path $Target 'playwright_desired.txt'))) {
    Set-Content (Join-Path $Target 'playwright_desired.txt') 'off' -NoNewline
}

$desktop = [Environment]::GetFolderPath('Desktop')
# Build the Chinese shortcut name from Unicode code points so Windows PowerShell 5.1
# can run this UTF-8 source reliably even when its legacy script decoder is active.
$shortcutName = (-join @(
    [char]0x6C47, [char]0x4E91, [char]0x7535, [char]0x8111,
    [char]0x63A7, [char]0x5236, [char]0x5668
)) + '.lnk'
$link = Join-Path $desktop $shortcutName
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($link)
$sc.TargetPath = Join-Path $Target 'HuiyunComputerController.exe'
$sc.WorkingDirectory = $Target
$icon = Join-Path $Target 'Connection.ico'
if (Test-Path $icon) { $sc.IconLocation = "$icon,0" }
$sc.Save()

Write-Host "INSTALL_OK=$Target"
Write-Host "SHORTCUT=$link"
