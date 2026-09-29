param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$manifest = Join-Path $root 'src-tauri\Cargo.toml'
$version = (Get-Content (Join-Path $root 'VERSION') -Raw).Trim()
$out = Join-Path $root 'dist'
$target = Join-Path $root 'src-tauri\target\release\huiyun-lan-transfer.exe'
$portable = Join-Path $out ("Huiyun-LAN-Transfer-Portable-{0}-x64.exe" -f $version)

New-Item -ItemType Directory -Force -Path $out | Out-Null
cargo build --release --manifest-path $manifest
if ($LASTEXITCODE -ne 0) { throw 'cargo build failed' }
if (-not (Test-Path $target)) { throw "Release executable not found: $target" }

Copy-Item -LiteralPath $target -Destination $portable -Force
$item = Get-Item $portable
$sha = [System.Security.Cryptography.SHA256]::Create()
try {
    $stream = [System.IO.File]::OpenRead($portable)
    try {
        $hashBytes = $sha.ComputeHash($stream)
    } finally {
        $stream.Dispose()
    }
} finally {
    $sha.Dispose()
}
$hash = ([System.BitConverter]::ToString($hashBytes)).Replace('-', '')
Write-Output ("PORTABLE={0}" -f $item.FullName)
Write-Output ("SIZE_MB={0}" -f [math]::Round($item.Length / 1MB, 2))
Write-Output ("SHA256={0}" -f $hash)
