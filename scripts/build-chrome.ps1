$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).ProviderPath
$builder = Join-Path $root "scripts\build-extensions.mjs"
$sourceDir = Join-Path $root "maca por chrome"
$manifestPath = Join-Path $sourceDir "manifest.json"
$artifactsDir = Join-Path $root "dist\chrome"

node $builder chrome

if (-not (Test-Path $manifestPath)) {
  throw "Chrome manifest not found at $manifestPath"
}

$manifest = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json
$filename = "maca-for-chrome-$($manifest.version).zip"
$artifactPath = Join-Path $artifactsDir $filename

New-Item -ItemType Directory -Force -Path $artifactsDir | Out-Null
if (Test-Path $artifactPath) {
  Remove-Item -Force $artifactPath
}

Compress-Archive -Path (Join-Path $sourceDir "*") -DestinationPath $artifactPath -Force

Write-Host "Chrome package created at dist/chrome/$filename"
