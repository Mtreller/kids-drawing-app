export const INSTALL_HIDE_KEY = 'color-pop-hide-install-help';
export const INSTALL_LATER_KEY = 'color-pop-install-help-later';

export type InstallPlatform = 'ios' | 'android';

export type InstallEnvironment = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  standalone: boolean;
  fullscreen: boolean;
  iosStandalone: boolean;
};

export function readInstallEnvironment(): InstallEnvironment {
  const media = typeof window.matchMedia === 'function'
    ? (query: string) => window.matchMedia(query).matches
    : () => false;
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  return {
    userAgent: window.navigator.userAgent,
    platform: window.navigator.platform,
    maxTouchPoints: window.navigator.maxTouchPoints || 0,
    standalone: media('(display-mode: standalone)'),
    fullscreen: media('(display-mode: fullscreen)'),
    iosStandalone: navigatorWithStandalone.standalone === true,
  };
}

export function detectInstallPlatform(env: Pick<InstallEnvironment, 'userAgent' | 'platform' | 'maxTouchPoints'>): InstallPlatform | null {
  if (/Android/i.test(env.userAgent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(env.userAgent)) return 'ios';
  if (env.platform === 'MacIntel' && env.maxTouchPoints > 1) return 'ios';
  return null;
}

export function isIosSafariHint(userAgent: string) {
  return /iPhone|iPad|iPod/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS/i.test(userAgent);
}

export function isRunningAsInstalledApp(env: Pick<InstallEnvironment, 'standalone' | 'fullscreen' | 'iosStandalone'>) {
  return env.standalone || env.fullscreen || env.iosStandalone;
}

export function readFlag(key: string) {
  try { return window.localStorage.getItem(key) === 'true' || window.sessionStorage.getItem(key) === 'true'; }
  catch { return false; }
}

export function writeFlag(key: string, scope: 'local' | 'session') {
  try {
    (scope === 'local' ? window.localStorage : window.sessionStorage).setItem(key, 'true');
  } catch { /* Still hide for this visit when storage is blocked. */ }
}

export function forcedInstallPlatform(): InstallPlatform | null {
  try {
    const value = new URLSearchParams(window.location.search).get('installHelp');
    return value === 'ios' || value === 'android' ? value : null;
  } catch {
    return null;
  }
}

export function shouldShowInstallHelp(env: InstallEnvironment) {
  if (isRunningAsInstalledApp(env)) return false;
  if (!(forcedInstallPlatform() ?? detectInstallPlatform(env))) return false;
  return !readFlag(INSTALL_HIDE_KEY) && !readFlag(INSTALL_LATER_KEY);
}
