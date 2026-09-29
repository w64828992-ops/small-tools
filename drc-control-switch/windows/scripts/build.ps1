param(
    [string]$OutDir = (Join-Path $PSScriptRoot '..\dist\windows')
)

$ErrorActionPreference = 'Stop'
$toolRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runtime = Join-Path $toolRoot 'runtime'
$source = Join-Path $toolRoot 'src\Controller.cs'
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'

if (-not (Test-Path $csc)) { throw "C# compiler not found: $csc" }
if (-not (Test-Path (Join-Path $runtime 'package-lock.json'))) {
    throw 'runtime\package-lock.json is required for reproducible builds.'
}

if (Test-Path $OutDir) { Remove-Item $OutDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

& $csc /nologo /target:winexe /utf8output /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll "/out:$OutDir\HuiyunComputerController.exe" $source
if ($LASTEXITCODE -ne 0) { throw 'Controller compile failed.' }

Copy-Item (Join-Path $runtime '*.mjs') $OutDir
Copy-Item (Join-Path $runtime 'package.json') $OutDir
Copy-Item (Join-Path $runtime 'package-lock.json') $OutDir

$node = (Get-Command node.exe -ErrorAction Stop).Source
Copy-Item $node (Join-Path $OutDir 'node.exe')

$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'
Push-Location $OutDir
try {
    & npm.cmd ci --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
} finally {
    Pop-Location
}

Write-Host "BUILD_OK=$OutDir"
