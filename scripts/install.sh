#!/usr/bin/env bash
# GitSquad CLI installer — macOS / Linux.
# Downloads the latest release binary from GitHub Releases.
# Usage: curl -fsSL https://raw.githubusercontent.com/feifeifeimoon/GitSquad/main/scripts/install.sh | bash
set -euo pipefail

REPO="feifeifeimoon/GitSquad"
PROJECT="gitsquad"

# Detect OS / arch (goreleaser archive naming: gitsquad_<version>_<os>_<arch>.tar.gz).
case "$(uname -s)" in
  Linux) OS="linux" ;;
  Darwin) OS="macOS" ;;
  *) echo "unsupported OS: $(uname -s)" >&2; exit 1 ;;
esac

case "$(uname -m)" in
  x86_64 | amd64) ARCH="x86_64" ;;
  arm64 | aarch64) ARCH="arm64" ;;
  *) echo "unsupported arch: $(uname -m)" >&2; exit 1 ;;
esac

# Resolve the latest release tag (e.g. v1.2.3). Prefer the stable release via
# the /releases/latest redirect; fall back to the newest prerelease from the
# releases Atom feed. Both are web endpoints — no GitHub API rate limits.
FINAL="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest" 2>/dev/null || true)"
case "$FINAL" in
  */releases/tag/*)
    TAG="${FINAL##*/}"
    ;;
  *)
    TAG="$(curl -fsSL "https://github.com/$REPO/releases.atom" 2>/dev/null \
      | sed -n 's|.*releases/tag/\([^"<]*\).*|\1|p' | head -1)"
    if [ -n "$TAG" ]; then
      echo "NOTE: no stable release yet, installing prerelease $TAG" >&2
    fi
    ;;
esac
if [ -z "$TAG" ]; then
  echo "error: could not resolve any gitsquad release." >&2
  echo "If no release exists yet, create one: git tag v0.1.0 && git push origin v0.1.0" >&2
  exit 1
fi
VERSION="${TAG#v}" # goreleaser .Version strips the leading "v"

ASSET="${PROJECT}_${VERSION}_${OS}_${ARCH}.tar.gz"
URL="https://github.com/$REPO/releases/download/$TAG/$ASSET"

echo "Downloading gitsquad $TAG ($OS/$ARCH)..."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL "$URL" -o "$TMP/gitsquad.tar.gz"
tar -xzf "$TMP/gitsquad.tar.gz" -C "$TMP" "$PROJECT"

# Prefer /usr/local/bin (with sudo), fall back to ~/.local/bin.
if [ -w /usr/local/bin ]; then
  INSTALL_DIR=/usr/local/bin
  cp "$TMP/$PROJECT" "$INSTALL_DIR/$PROJECT"
  chmod +x "$INSTALL_DIR/$PROJECT"
else
  INSTALL_DIR="$HOME/.local/bin"
  mkdir -p "$INSTALL_DIR"
  cp "$TMP/$PROJECT" "$INSTALL_DIR/$PROJECT"
  chmod +x "$INSTALL_DIR/$PROJECT"
  case ":$PATH:" in
    *":$INSTALL_DIR:"*) ;;
    *) echo "NOTE: $INSTALL_DIR is not on your PATH. Add it with:" >&2
       echo "  echo 'export PATH=\"$INSTALL_DIR:\$PATH\"' >> ~/.bashrc && source ~/.bashrc" >&2 ;;
  esac
fi

echo "Installed gitsquad $TAG to $INSTALL_DIR/$PROJECT"
"$INSTALL_DIR/$PROJECT" --version
