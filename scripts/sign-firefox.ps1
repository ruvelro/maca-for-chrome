$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).ProviderPath
$builder = Join-Path $root "scripts\build-extensions.mjs"
$sourceDir = Join-Path $root "maca for firefox"
$manifestPath = Join-Path $sourceDir "manifest.json"
$artifactsDir = Join-Path $root "dist\firefox\signed"

node $builder firefox

if (-not (Test-Path $manifestPath)) {
  throw "Firefox manifest not found at $manifestPath"
}

if ([string]::IsNullOrWhiteSpace($env:WEB_EXT_API_KEY) -and -not [string]::IsNullOrWhiteSpace($env:AMO_JWT_ISSUER)) {
  $env:WEB_EXT_API_KEY = $env:AMO_JWT_ISSUER
}

if ([string]::IsNullOrWhiteSpace($env:WEB_EXT_API_SECRET) -and -not [string]::IsNullOrWhiteSpace($env:AMO_JWT_SECRET)) {
  $env:WEB_EXT_API_SECRET = $env:AMO_JWT_SECRET
}

if ([string]::IsNullOrWhiteSpace($env:WEB_EXT_API_KEY) -or [string]::IsNullOrWhiteSpace($env:WEB_EXT_API_SECRET)) {
  throw "Set WEB_EXT_API_KEY and WEB_EXT_API_SECRET (or AMO_JWT_ISSUER and AMO_JWT_SECRET) before signing."
}

$manifest = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json
$finalName = "maca-for-firefox-$($manifest.version).xpi"
$finalPath = Join-Path $artifactsDir $finalName

New-Item -ItemType Directory -Force -Path $artifactsDir | Out-Null

$command = 'pushd "{0}" && npx --yes web-ext sign --channel unlisted --source-dir "maca for firefox" --artifacts-dir "dist\firefox\signed"' -f $root
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

$latestSigned = Get-ChildItem -Path $artifactsDir -Filter *.xpi | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1

if (-not $latestSigned) {
  throw "web-ext finished without producing a signed .xpi in $artifactsDir"
}

if ($latestSigned.FullName -ne $finalPath) {
  Move-Item -Force -Path $latestSigned.FullName -Destination $finalPath
}

Write-Host "Signed Firefox package created at dist/firefox/signed/$finalName"
