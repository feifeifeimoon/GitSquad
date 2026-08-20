# GitSquad CLI installer — Windows (PowerShell 5.1+).
# Downloads the latest release binary from GitHub Releases.
# Usage: irm https://raw.githubusercontent.com/feifeifeimoon/GitSquad/main/scripts/install.ps1 | iex
$ErrorActionPreference = "Stop"

$repo = "feifeifeimoon/GitSquad"
$project = "gitsquad"

# Detect arch (goreleaser archive naming: gitsquad_<version>_windows_<arch>.zip).
$arch = switch ([System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture) {
  "X64" { "x86_64" }
  "Arm64" { "arm64" }
  default { throw "unsupported arch: $_" }
}

# Resolve the latest release tag (e.g. v1.2.3). Prefer the stable release;
# fall back to the newest prerelease while no stable release exists yet.
try {
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest"
} catch {
  try {
    $releases = @(Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases?per_page=1")
    if ($releases.Count -eq 0) { throw "no releases" }
    $release = $releases[0]
    Write-Host "NOTE: no stable release yet, installing prerelease $($release.tag_name)." -ForegroundColor Yellow
  } catch {
    Write-Host "error: could not resolve any gitsquad release." -ForegroundColor Red
    Write-Host "If no release exists yet, create one: git tag v0.1.0 && git push origin v0.1.0" -ForegroundColor Red
    exit 1
  }
}
$tag = $release.tag_name
$version = $tag.TrimStart("v") # goreleaser .Version strips the leading "v"

$asset = "${project}_${version}_windows_${arch}.zip"
$url = "https://github.com/$repo/releases/download/$tag/$asset"

Write-Host "Downloading gitsquad $tag (windows/$arch)..."
$tmp = Join-Path $env:TEMP ("gitsquad-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  $zip = Join-Path $tmp "$asset"
  Invoke-WebRequest -Uri $url -OutFile $zip

  $installDir = Join-Path $env:LOCALAPPDATA "gitsquad\bin"
  New-Item -ItemType Directory -Path $installDir -Force | Out-Null
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  Copy-Item (Join-Path $tmp "$project.exe") (Join-Path $installDir "$project.exe") -Force

  # Add to user PATH (no admin needed).
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($userPath -notlike "*$installDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$userPath;$installDir", "User")
    $env:Path = "$env:Path;$installDir"
    Write-Host "Added $installDir to your user PATH. Restart terminals to pick it up."
  }

  Write-Host "Installed gitsquad $tag to $installDir"
  & (Join-Path $installDir "$project.exe") --version
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
