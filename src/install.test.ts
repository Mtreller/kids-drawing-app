import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectInstallKind,
  detectInstallPlatform,
  isIosSafariHint,
  isRunningAsInstalledApp,
  isTabletDevice,
  shouldShowInstallHelp,
  type InstallEnvironment,
} from './install.ts';

function env(partial: Partial<InstallEnvironment>): InstallEnvironment {
  return {
    userAgent: '',
    platform: 'Linux',
    maxTouchPoints: 0,
    standalone: false,
    fullscreen: false,
    iosStandalone: false,
    coarsePointer: false,
    viewportWidth: 390,
    ...partial,
  };
}

test('detects Android phones and tablets', () => {
  assert.deepEqual(detectInstallKind(env({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36' })), { platform: 'android', tablet: false });
  assert.deepEqual(detectInstallKind(env({
    userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-X810) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Safari/537.36',
    viewportWidth: 1024,
    coarsePointer: true,
    maxTouchPoints: 5,
  })), { platform: 'android', tablet: true });
});

test('detects iPhone, iPad, and iPadOS desktop UA', () => {
  assert.deepEqual(detectInstallKind(env({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })), { platform: 'ios', tablet: false });
  assert.deepEqual(detectInstallKind(env({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' })), { platform: 'ios', tablet: true });
  assert.deepEqual(detectInstallKind(env({
    platform: 'MacIntel',
    maxTouchPoints: 5,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    coarsePointer: true,
    viewportWidth: 1024,
  })), { platform: 'ios', tablet: true });
  assert.equal(detectInstallPlatform(env({ platform: 'iPad', maxTouchPoints: 5, userAgent: 'Macintosh' })), 'ios');
});

test('detects Android tablets that request the desktop site', () => {
  assert.equal(isTabletDevice(env({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    coarsePointer: true,
    maxTouchPoints: 5,
    viewportWidth: 1133,
  })), true);
  assert.deepEqual(detectInstallKind(env({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    coarsePointer: true,
    maxTouchPoints: 5,
    viewportWidth: 1133,
  })), { platform: 'android', tablet: true });
});

test('ignores desktop browsers', () => {
  assert.equal(detectInstallPlatform(env({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 })), null);
  assert.equal(detectInstallPlatform(env({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', viewportWidth: 1440 })), null);
});

test('does not treat an iPhone as a tablet', () => {
  assert.equal(isTabletDevice(env({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    coarsePointer: true,
    maxTouchPoints: 5,
    viewportWidth: 932,
  })), false);
});

test('treats standalone, fullscreen, and iOS home-screen as already installed', () => {
  assert.equal(isRunningAsInstalledApp(env({ standalone: true })), true);
  assert.equal(isRunningAsInstalledApp(env({ fullscreen: true })), true);
  assert.equal(isRunningAsInstalledApp(env({ iosStandalone: true })), true);
  assert.equal(isRunningAsInstalledApp(env()), false);
});

test('hides install help when the app is already saved', () => {
  assert.equal(shouldShowInstallHelp(env({
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)',
    iosStandalone: true,
  })), false);
  assert.equal(shouldShowInstallHelp(env({
    userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-X810) Chrome/120.0.0.0 Safari/537.36',
    standalone: true,
  })), false);
});

test('shows install help on phones, iPads, and tablets in the browser', () => {
  assert.equal(shouldShowInstallHelp(env({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  })), true);
  assert.equal(shouldShowInstallHelp(env({
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  })), true);
  assert.equal(shouldShowInstallHelp(env({
    userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/128.0.0.0 Mobile Safari/537.36',
  })), true);
  assert.equal(shouldShowInstallHelp(env({
    userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-X810) Chrome/120.0.0.0 Safari/537.36',
    viewportWidth: 1024,
  })), true);
});

test('Safari hint works for iPadOS desktop UA and excludes Chrome', () => {
  assert.equal(isIosSafariHint('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'), true);
  assert.equal(isIosSafariHint('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'), true);
  assert.equal(isIosSafariHint('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) CriOS/128.0.0.0 Mobile/15E148 Safari/604.1'), false);
  assert.equal(isIosSafariHint('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'), false);
});
