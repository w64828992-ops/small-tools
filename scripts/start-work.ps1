param(
    [ValidateSet('feat','fix','docs','security')]
    [string]$Type = 'feat',
    [string]$SoftwareName,
    [Parameter(Mandatory=$true)]
    [string]$ShortDescription,
    [string]$Repo = $(if ($env:SMALL_TOOLS_HOME) { $env:SMALL_TOOLS_HOME } else { 'D:\Dev\small-tools' })
)

$ErrorActionPreference = 'Stop'
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')

function To-Slug {
    param([string]$Value)
    $slug = $Value.Trim().ToLowerInvariant()
    $slug = [regex]::Replace($slug, '[^a-z0-9-]+', '-')
    $slug = [regex]::Replace($slug, '-+', '-').Trim('-')
    if (-not $slug) { throw "Invalid slug source: $Value" }
    return $slug
}

if (-not (Test-Path (Join-Path $Repo '.git'))) { throw "Repository not found: $Repo" }
if ($Type -ne 'docs' -and -not $SoftwareName) { throw 'SoftwareName is required unless Type=docs.' }

Set-Location $Repo
if (@(git status --porcelain).Count -gt 0) {
    throw 'Working tree is not clean. Commit/stash current work before starting another task.'
}

gh auth status --hostname github.com | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI is not authenticated.' }

git fetch origin --prune --tags
if ($LASTEXITCODE -ne 0) { throw 'git fetch failed.' }
git checkout main
if ($LASTEXITCODE -ne 0) { throw 'Cannot checkout main.' }
git pull --ff-only origin main
if ($LASTEXITCODE -ne 0) { throw 'Cannot fast-forward main.' }

$short = To-Slug $ShortDescription
if ($Type -eq 'docs') {
    $branch = "docs/$short"
} else {
    $tool = To-Slug $SoftwareName
    $branch = "$Type/$tool/$short"
}

git show-ref --verify --quiet "refs/heads/$branch"
if ($LASTEXITCODE -eq 0) { throw "Local branch already exists: $branch" }
git ls-remote --exit-code --heads origin $branch *> $null
if ($LASTEXITCODE -eq 0) { throw "Remote branch already exists: $branch" }

git checkout -b $branch
if ($LASTEXITCODE -ne 0) { throw "Cannot create branch: $branch" }

Write-Host ("WORK_STARTED_BRANCH={0}" -f $branch)
Write-Host ("WORKSPACE={0}" -f $Repo)
