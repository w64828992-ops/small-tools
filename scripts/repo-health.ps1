param(
    [string]$Repo = $(if ($env:SMALL_TOOLS_HOME) { $env:SMALL_TOOLS_HOME } else { 'D:\Dev\small-tools' })
)

$ErrorActionPreference = 'Stop'
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')

function Require-Command {
    param([string]$Name, [string]$Command)
    $resolved = Get-Command $Command -ErrorAction SilentlyContinue
    if (-not $resolved) { throw "Missing required command: $Name ($Command)" }
    Write-Host ("[OK] {0}" -f $Name)
}

if (-not (Test-Path (Join-Path $Repo '.git'))) {
    throw "small-tools repository not found: $Repo"
}

Set-Location $Repo
$remote = (git remote get-url origin).Trim()
if ($remote -notmatch 'w64828992-ops/small-tools') {
    throw "Unexpected origin remote: $remote"
}

@(
    @('Git','git'),
    @('GitHub CLI','gh'),
    @('Node.js','node'),
    @('Python','python'),
    @('PowerShell 7','pwsh'),
    @('Codex','codex'),
    @('Playwright MCP','playwright-mcp'),
    @('Gitleaks','gitleaks')
) | ForEach-Object { Require-Command -Name $_[0] -Command $_[1] }

gh auth status --hostname github.com | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI is not authenticated.' }

$standard = Select-String -Path (Join-Path $Repo 'docs\REPO_STANDARD.md') -Pattern 'Rule Version:' | Select-Object -First 1
$branch = (git branch --show-current).Trim()
$dirty = @(git status --porcelain)
Write-Host ("[OK] Repository: {0}" -f $remote)
Write-Host ("[OK] Branch: {0}" -f $branch)
Write-Host ("[OK] Standard: {0}" -f $standard.Line.Trim())
if ($dirty.Count -eq 0) {
    Write-Host '[OK] Working tree clean'
} else {
    Write-Warning ("Working tree has {0} changed item(s)." -f $dirty.Count)
}
Write-Host 'REPO_HEALTH_OK'
