// Which desktop the reader is on, and the installer that matches it.
//
// The two installers are not interchangeable: install.sh is bash (macOS /
// Linux), install.ps1 is PowerShell (Windows). The connect dialog used to show
// only the bash line, which left a Windows reader with a command their shell
// cannot run. Detection lives here so the dialog can default to the reader's
// machine and still let them switch.

export type Platform = "macos" | "windows" | "linux";

export const PLATFORMS: readonly Platform[] = ["macos", "windows", "linux"];

export const PLATFORM_LABEL: Record<Platform, string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
};

/** Where the commands go on each machine. */
export const PLATFORM_HINT: Record<Platform, string> = {
  macos: "Run these in Terminal.",
  windows: "Run these in PowerShell.",
  linux: "Run these in your terminal.",
};

const INSTALL_SH =
  "https://raw.githubusercontent.com/feifeifeimoon/GitSquad/main/scripts/install.sh";
const INSTALL_PS1 =
  "https://raw.githubusercontent.com/feifeifeimoon/GitSquad/main/scripts/install.ps1";

export interface InstallStep {
  /** Stable within a platform; the dialog adds the platform suffix. */
  id: "install" | "login" | "run";
  label: string;
  command: string;
}

/** The three commands, in the order the dialog shows them. */
export function installSteps(platform: Platform): InstallStep[] {
  return [
    {
      id: "install",
      label: "Step 1: Install GitSquad CLI",
      command:
        platform === "windows"
          ? `irm ${INSTALL_PS1} | iex`
          : `curl -fsSL ${INSTALL_SH} | bash`,
    },
    {
      id: "login",
      label: "Step 2: Login",
      command: "gitsquad daemon login",
    },
    {
      id: "run",
      label: "Step 3: Start the daemon",
      command: "gitsquad daemon run",
    },
  ];
}

/**
 * The platform implied by a user agent and `navigator.platform`, kept pure so
 * the mapping is testable outside a browser.
 *
 * Unknown desktops fall back to macOS: the reader can correct it with the tabs,
 * and a guess is better than no selection. The order matters — Windows first,
 * because a Windows user agent can contain other words; macOS before Linux
 * because an iPhone reports "MacIntel" for compatibility.
 */
export function platformFrom(userAgent: string, platform: string): Platform {
  const value = `${userAgent} ${platform}`.toLowerCase();
  if (
    value.includes("windows") ||
    value.includes("win32") ||
    value.includes("win64")
  ) {
    return "windows";
  }
  if (value.includes("mac") || value.includes("darwin")) return "macos";
  if (value.includes("linux") || value.includes("x11")) return "linux";
  return "macos";
}

/** The browser's platform, or null where there is no browser (the server). */
export function detectPlatform(): Platform | null {
  if (typeof navigator === "undefined") return null;
  return platformFrom(navigator.userAgent, navigator.platform);
}
