export const INSTALL_HIDE_KEY = 'color-pop-hide-install-help';
export const INSTALL_LATER_KEY = 'color-pop-install-help-later';

export type InstallPlatform = 'ios' | 'android';
export type InstallKind = { platform: InstallPlatform; tablet: boolean };

export type InstallEnvironment = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  standalone: boolean;
  fullscreen: boolean;
  iosStandalone: boolean;
  coarsePointer: boolean;
  viewportWidth: number;
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
    coarsePointer: media('(pointer: coarse)'),
    viewportWidth: window.innerWidth || 0,
  };
}

function looksLikeIos(env: Pick<InstallEnvironment, 'userAgent' | 'platform' | 'maxTouchPoints'>) {
  if (/iPhone|iPad|iPod/i.test(env.userAgent)) return true;
  if (env.platform === 'iPad' || env.platform === 'iPhone' || env.platform === 'iPod') return true;
  const macLike = env.platform === 'MacIntel' || /Macintosh|Mac OS X/i.test(env.userAgent);
  return macLike && env.maxTouchPoints > 1;
}

function looksLikeAndroid(userAgent: string) {
  return /Android/i.test(userAgent) || /Silk|Kindle Fire|KF[A-Z][A-Z0-9]{2,}/i.test(userAgent);
}

export function isTabletDevice(env: Pick<InstallEnvironment, 'userAgent' | 'platform' | 'maxTouchPoints' | 'coarsePointer' | 'viewportWidth'>) {
  if (/iPhone|iPod/i.test(env.userAgent) || env.platform === 'iPhone' || env.platform === 'iPod') return false;
  if (/iPad/i.test(env.userAgent) || env.platform === 'iPad') return true;
  if (looksLikeIos(env)) return true;
  if (/Tablet|\bTab\b|Silk|PlayBook|Nexus 7|Nexus 9|Nexus 10/i.test(env.userAgent)) return true;
  if (looksLikeAndroid(env.userAgent) && !/Mobile/i.test(env.userAgent)) return true;
  return env.coarsePointer && env.maxTouchPoints > 1 && env.viewportWidth >= 768;
}

export function detectInstallKind(env: Pick<InstallEnvironment, 'userAgent' | 'platform' | 'maxTouchPoints' | 'coarsePointer' | 'viewportWidth'>): InstallKind | null {
  const tablet = isTabletDevice(env);
  if (looksLikeIos(env)) return { platform: 'ios', tablet };
  if (looksLikeAndroid(env.userAgent)) return { platform: 'android', tablet };
  if (tablet) return { platform: 'android', tablet: true };
  return null;
}

export function detectInstallPlatform(env: Pick<InstallEnvironment, 'userAgent' | 'platform' | 'maxTouchPoints' | 'coarsePointer' | 'viewportWidth'>): InstallPlatform | null {
  return detectInstallKind(env)?.platform ?? null;
}

export function isIosSafariHint(userAgent: string) {
  const chrome = /Chrome|CriOS|Chromium|Edg|EdgiOS/i.test(userAgent);
  const firefox = /Firefox|FxiOS/i.test(userAgent);
  return /Safari/i.test(userAgent) && !chrome && !firefox;
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

export function forcedInstallKind(): InstallKind | null {
  try {
    const value = new URLSearchParams(window.location.search).get('installHelp');
    if (value === 'ios') return { platform: 'ios', tablet: false };
    if (value === 'ipad' || value === 'ios-tablet') return { platform: 'ios', tablet: true };
    if (value === 'android') return { platform: 'android', tablet: false };
    if (value === 'tablet' || value === 'android-tablet') return { platform: 'android', tablet: true };
    return null;
  } catch {
    return null;
  }
}

export function forcedInstallPlatform(): InstallPlatform | null {
  return forcedInstallKind()?.platform ?? null;
}

export function shouldShowInstallHelp(env: InstallEnvironment) {
  if (isRunningAsInstalledApp(env)) return false;
  if (!(forcedInstallKind() ?? detectInstallKind(env))) return false;
  return !readFlag(INSTALL_HIDE_KEY) && !readFlag(INSTALL_LATER_KEY);
}
