param(
    [string]$ConfigPath = (Join-Path $env:USERPROFILE '.codex\config.toml'),
    [int]$Port = 8931
)

$ErrorActionPreference = 'Stop'
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
if (-not (Test-Path $ConfigPath)) { throw "Codex config not found: $ConfigPath" }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = "$ConfigPath.backup-huiyun-$stamp"
Copy-Item $ConfigPath $backup

# Codex Desktop may keep config.toml open. A direct Set-Content can then fail with a
# sharing violation, while same-directory atomic replacement remains safe and supported.
function Replace-ConfigAtomically {
    param([string]$Content)
    $temp = "$ConfigPath.huiyun.tmp"
    $replaceBackup = "$ConfigPath.huiyun.replace.bak"
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($temp, $Content, $utf8NoBom)
    [IO.File]::Replace($temp, $ConfigPath, $replaceBackup)
    Remove-Item $replaceBackup -Force -ErrorAction SilentlyContinue
}

function Restore-ConfigBackup {
    $temp = "$ConfigPath.huiyun.restore.tmp"
    $replaceBackup = "$ConfigPath.huiyun.restore.replace.bak"
    [IO.File]::Copy($backup, $temp, $true)
    [IO.File]::Replace($temp, $ConfigPath, $replaceBackup)
    Remove-Item $replaceBackup -Force -ErrorAction SilentlyContinue
}

$text = Get-Content $ConfigPath -Raw
$replacement = @"
[mcp_servers.playwright]
url = 'http://127.0.0.1:$Port/mcp'
startup_timeout_sec = 30
required = false

"@

$pattern = '(?ms)^\[mcp_servers\.playwright\]\r?\n.*?(?=^\[|\z)'
if ([regex]::IsMatch($text, $pattern)) {
    $text = [regex]::Replace($text, $pattern, $replacement, 1)
} else {
    if (-not $text.EndsWith([Environment]::NewLine)) { $text += [Environment]::NewLine }
    $text += [Environment]::NewLine + $replacement
}
Replace-ConfigAtomically -Content $text

$codex = (Get-Command codex.exe -ErrorAction SilentlyContinue).Source
if (-not $codex -and $env:CODEX_CLI_PATH) { $codex = $env:CODEX_CLI_PATH }
if ($codex) {
    $json = & $codex mcp list --json 2>&1
    if ($LASTEXITCODE -ne 0) {
        Restore-ConfigBackup
        throw "Codex config validation failed. Original restored. $json"
    }
    $joined = ($json | Out-String)
    if ($joined -notmatch ('127\.0\.0\.1:' + $Port + '/mcp')) {
        Restore-ConfigBackup
        throw 'Codex did not report the expected Playwright HTTP endpoint. Original restored.'
    }
}

Write-Host "CODEX_PLAYWRIGHT_CONFIG_OK=$ConfigPath"
Write-Host "BACKUP=$backup"
