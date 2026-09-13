import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectInstallPlatform,
  isIosSafariHint,
  isRunningAsInstalledApp,
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
    ...partial,
  };
}

test('detects Android phones and tablets', () => {
  assert.equal(detectInstallPlatform(env({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' })), 'android');
});

test('detects iPhone, iPad, and iPadOS desktop UA', () => {
  assert.equal(detectInstallPlatform(env({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })), 'ios');
  assert.equal(detectInstallPlatform(env({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' })), 'ios');
  assert.equal(detectInstallPlatform(env({ platform: 'MacIntel', maxTouchPoints: 5, userAgent: 'Macintosh' })), 'ios');
});

test('ignores desktop browsers', () => {
  assert.equal(detectInstallPlatform(env({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 })), null);
  assert.equal(detectInstallPlatform(env({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })), null);
});

test('treats standalone, fullscreen, and iOS home-screen as already installed', () => {
  assert.equal(isRunningAsInstalledApp(env({ standalone: true })), true);
  assert.equal(isRunningAsInstalledApp(env({ fullscreen: true })), true);
  assert.equal(isRunningAsInstalledApp(env({ iosStandalone: true })), true);
  assert.equal(isRunningAsInstalledApp(env()), false);
});

test('hides install help when the app is already saved', () => {
  assert.equal(shouldShowInstallHelp(env({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    iosStandalone: true,
  })), false);
  assert.equal(shouldShowInstallHelp(env({
    userAgent: 'Mozilla/5.0 (Linux; Android 14)',
    standalone: true,
  })), false);
});

test('shows install help on mobile Safari/Chrome in the browser', () => {
  assert.equal(shouldShowInstallHelp(env({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  })), true);
  assert.equal(shouldShowInstallHelp(env({
    userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/128.0.0.0',
  })), true);
});

test('Safari-on-iOS hint excludes iOS Chrome', () => {
  assert.equal(isIosSafariHint('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'), true);
  assert.equal(isIosSafariHint('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) CriOS/128.0.0.0 Mobile/15E148 Safari/604.1'), false);
});
