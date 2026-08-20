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

# Resolve the latest release tag (e.g. v1.2.3). Prefer the stable release via
# the /releases/latest redirect; fall back to the newest prerelease from the
# releases Atom feed. Both are web endpoints — no GitHub API rate limits.
$tag = $null
try {
  $req = [System.Net.HttpWebRequest]::Create("https://github.com/$repo/releases/latest")
  $req.UserAgent = "gitsquad-installer"
  $req.AllowAutoRedirect = $false
  $resp = $req.GetResponse()
  $finalUrl = $resp.Headers["Location"]
  $resp.Close()
  if ($finalUrl -match "/releases/tag/([^/]+)/?$") {
    $tag = $Matches[1]
  }
} catch {
  # Redirect or network failure — fall through to the Atom feed below.
}

if (-not $tag) {
  try {
    $content = (Invoke-WebRequest -Uri "https://github.com/$repo/releases.atom" -UserAgent "gitsquad-installer").Content
    $m = [regex]::Match($content, 'releases/tag/([^"<]+)')
    if ($m.Success) {
      $tag = $m.Groups[1].Value
      Write-Host "NOTE: no stable release yet, installing prerelease $tag." -ForegroundColor Yellow
    }
  } catch {
    $tag = $null
  }
}

if (-not $tag) {
  Write-Host "error: could not resolve any gitsquad release." -ForegroundColor Red
  Write-Host "If no release exists yet, create one: git tag v0.1.0 && git push origin v0.1.0" -ForegroundColor Red
  throw "no release found"
}
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

    # Broadcast the change so new terminals launched from Explorer pick it up
    # immediately (SetEnvironmentVariable only writes the registry).
    try {
      Add-Type -Namespace Win32 -Name NativeMethods -MemberDefinition @'
[DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);
'@
      $null = [Win32.NativeMethods]::SendMessageTimeout(
        [IntPtr]0xffff, 0x001A, [UIntPtr]::Zero,
        "$userPath;$installDir", 2, 5000, [ref][UIntPtr]::Zero)
    } catch {
      # Non-fatal — PATH is already persisted; a restart will pick it up.
    }
  }

  Write-Host "Installed gitsquad $tag to $installDir"
  & (Join-Path $installDir "$project.exe") --version
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
