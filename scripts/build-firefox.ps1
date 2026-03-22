$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).ProviderPath
$builder = Join-Path $root "scripts\build-extensions.mjs"
$sourceDir = Join-Path $root "maca for firefox"
$manifestPath = Join-Path $sourceDir "manifest.json"
$artifactsDir = Join-Path $root "dist\firefox\unsigned"

node $builder firefox

if (-not (Test-Path $manifestPath)) {
  throw "Firefox manifest not found at $manifestPath"
}

$manifest = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json
$filename = "maca-for-firefox-$($manifest.version)-unsigned.zip"

New-Item -ItemType Directory -Force -Path $artifactsDir | Out-Null

$command = 'pushd "{0}" && npx --yes web-ext build --source-dir "maca for firefox" --artifacts-dir "dist\firefox\unsigned" --filename "{1}" --overwrite-dest' -f $root, $filename
Push-Location $env:SystemDrive
try {
  cmd /d /s /c $command
}
finally {
  Pop-Location
}

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "Unsigned Firefox package created at dist/firefox/unsigned/$filename"
