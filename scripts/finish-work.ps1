param(
    [Parameter(Mandatory=$true)]
    [string]$SoftwareName,
    [ValidateSet('feat','fix','docs','refactor','test','chore','release','security')]
    [string]$CommitType = 'feat',
    [Parameter(Mandatory=$true)]
    [string]$Message,
    [string]$TestCommand,
    [switch]$SkipTests,
    [switch]$CreateTag,
    [switch]$KeepBranch,
    [string]$Repo = $(if ($env:SMALL_TOOLS_HOME) { $env:SMALL_TOOLS_HOME } else { 'D:\Dev\small-tools' })
)

$ErrorActionPreference = 'Stop'
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
$Repository = 'w64828992-ops/small-tools'

function Invoke-Checked {
    param([string]$Label, [scriptblock]$Action)
    Write-Host ("== {0} ==" -f $Label)
    & $Action
    if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit code $LASTEXITCODE" }
}

function Get-DefaultTestCommand {
    param([string]$ToolPath)
    $candidates = @(
        @{ Path = (Join-Path $ToolPath 'tests\smoke-test.ps1'); Cmd = 'pwsh -NoProfile -File "tests\smoke-test.ps1"' },
        @{ Path = (Join-Path $ToolPath 'tests\smoke-test.cmd'); Cmd = 'cmd /d /c "tests\smoke-test.cmd"' },
        @{ Path = (Join-Path $ToolPath 'tests\smoke-test.bat'); Cmd = 'cmd /d /c "tests\smoke-test.bat"' },
        @{ Path = (Join-Path $ToolPath 'tests\smoke-test.sh'); Cmd = 'bash "tests/smoke-test.sh"' },
        @{ Path = (Join-Path $ToolPath 'scripts\test.ps1'); Cmd = 'pwsh -NoProfile -File "scripts\test.ps1"' },
        @{ Path = (Join-Path $ToolPath 'scripts\test.cmd'); Cmd = 'cmd /d /c "scripts\test.cmd"' }
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate.Path) { return $candidate.Cmd }
    }
    return $null
}

if (-not (Test-Path (Join-Path $Repo '.git'))) { throw "Repository not found: $Repo" }
Set-Location $Repo
$branch = (git branch --show-current).Trim()
if (-not $branch) { throw 'Unable to determine current branch.' }
if ($branch -eq 'main' -or $branch -like 'tool/*') {
    throw "Finish workflow must run from a temporary development branch, not $branch."
}
if ($branch -notmatch '^(feat|fix|docs|security)/') {
    throw "Branch does not follow repository temporary branch rules: $branch"
}

gh auth status --hostname github.com | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI is not authenticated.' }

$isRepoLevel = ($SoftwareName -eq 'repo')
$toolPath = Join-Path $Repo $SoftwareName
if (-not $isRepoLevel) {
    if (-not (Test-Path $toolPath)) { throw "Tool directory not found: $toolPath" }
    foreach ($required in @('README.md','CHANGELOG.md','VERSION')) {
        if (-not (Test-Path (Join-Path $toolPath $required))) {
            throw "Required tool file missing: $SoftwareName\$required"
        }
    }
}

if (-not $SkipTests) {
    if (-not $TestCommand -and -not $isRepoLevel) {
        $TestCommand = Get-DefaultTestCommand -ToolPath $toolPath
    }
    if (-not $TestCommand) {
        throw 'No test command detected. Supply -TestCommand or explicitly use -SkipTests after manual validation.'
    }
    $testDir = if ($isRepoLevel) { $Repo } else { $toolPath }
    Push-Location $testDir
    try {
        Invoke-Checked 'Local tests' { cmd.exe /d /c $TestCommand }
    } finally {
        Pop-Location
    }
} else {
    Write-Warning 'Automated tests explicitly skipped. Delivery summary must state manual validation/limitations.'
}

git add -A
if (@(git diff --cached --name-only).Count -eq 0) { throw 'No staged changes to publish.' }

Invoke-Checked 'Local secret scan' {
    gitleaks git --staged --no-banner --redact=100 .
}

$title = "$CommitType($SoftwareName): $Message"
Invoke-Checked 'Git commit' { git commit -m $title }
Invoke-Checked 'Push temporary branch' { git push -u origin $branch }

$bodyFile = Join-Path $env:TEMP 'small-tools-pr-body.md'
$testText = if ($SkipTests) { 'Skipped by explicit switch; see delivery notes.' } else { $TestCommand }
@"
## Automated delivery

- Software: $SoftwareName
- Branch: $branch
- Local test: $testText
- Local Gitleaks: passed
- Repository Standard: docs/REPO_STANDARD.md

This PR was created by the Windows RDC development workflow.
"@ | Set-Content -Path $bodyFile -Encoding UTF8

$prUrl = (gh pr create --repo $Repository --base main --head $branch --title $title --body-file $bodyFile).Trim()
if ($LASTEXITCODE -ne 0 -or -not $prUrl) { throw 'Failed to create Pull Request.' }
$pr = gh pr view $prUrl --repo $Repository --json number,url | ConvertFrom-Json
Write-Host ("PR={0} {1}" -f $pr.number,$pr.url)

$scanSeen = $false
for ($i=0; $i -lt 24; $i++) {
    $json = gh pr checks $pr.number --repo $Repository --json name,state,bucket,workflow 2>$null
    if ($LASTEXITCODE -in 0,8 -and $json) {
        $checks = @($json | ConvertFrom-Json)
        $secret = @($checks | Where-Object { $_.workflow -eq 'Secret Scan' -or $_.name -match 'secret|gitleaks|Scan Git history' })
        if ($secret.Count -gt 0) { $scanSeen = $true; break }
    }
    Start-Sleep -Seconds 5
}
if (-not $scanSeen) {
    throw 'Secret Scan/CI did not produce a verifiable run record within 120 seconds. PR left open.'
}

Invoke-Checked 'Wait for GitHub checks' {
    gh pr checks $pr.number --repo $Repository --watch --fail-fast --interval 10
}

Invoke-Checked 'Merge PR' {
    gh pr merge $pr.number --repo $Repository --squash --delete-branch
}

git checkout main
Invoke-Checked 'Update local main' { git pull --ff-only origin main }
$mainSha = (git rev-parse HEAD).Trim()

$toolBranchStatus = 'not-applicable'
if (-not $isRepoLevel) {
    git fetch origin --prune
    git show-ref --verify --quiet "refs/remotes/origin/tool/$SoftwareName"
    if ($LASTEXITCODE -eq 0) {
        git merge-base --is-ancestor "origin/tool/$SoftwareName" main
        if ($LASTEXITCODE -ne 0) {
            throw "tool/$SoftwareName has diverged from main; manual review required."
        }
    }
    Invoke-Checked "Sync tool/$SoftwareName" { git push origin "main:refs/heads/tool/$SoftwareName" }
    $toolBranchStatus = 'synced'
}

$tagStatus = 'not-requested'
$tagName = ''
if ($CreateTag -and -not $isRepoLevel) {
    $version = (Get-Content (Join-Path $toolPath 'VERSION') -Raw).Trim()
    if (-not $version) { throw 'VERSION is empty.' }
    $tagName = "$SoftwareName-v$version"
    git fetch origin --tags
    $existing = (git rev-list -n 1 $tagName 2>$null)
    if ($existing) {
        if ($existing.Trim() -ne $mainSha) {
            throw "Tag $tagName already exists at a different commit. Tag was not rewritten."
        }
        $tagStatus = 'already-correct'
    } else {
        Invoke-Checked "Create tag $tagName" { git tag -a $tagName -m "release($SoftwareName): v$version" }
        Invoke-Checked "Push tag $tagName" { git push origin $tagName }
        $tagStatus = 'created'
    }
}

if (-not $KeepBranch) {
    git branch -D $branch *> $null
}

Write-Host '=== DELIVERY SUMMARY ==='
Write-Host ("Repository={0}" -f $Repository)
Write-Host ("Software={0}" -f $SoftwareName)
Write-Host ("MergedCommit={0}" -f $mainSha)
Write-Host ("PR={0}" -f $pr.number)
Write-Host 'SecretScanCI=passed'
Write-Host 'MainMerge=merged'
Write-Host ("ToolBranch={0}" -f $toolBranchStatus)
Write-Host ("Tag={0} {1}" -f $tagStatus,$tagName)
Write-Host ("TemporaryBranch={0}" -f $(if ($KeepBranch) {'kept'} else {'deleted'}))
Write-Host 'DELIVERY_ARCHIVE_COMPLETE'
