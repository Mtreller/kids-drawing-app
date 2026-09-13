import { useEffect, useState } from 'react';
import { ToolIcon } from '../icons';
import { useAndroidInstallPrompt } from '../hooks/useAndroidInstallPrompt';
import {
  INSTALL_HIDE_KEY,
  INSTALL_LATER_KEY,
  detectInstallKind,
  forcedInstallKind,
  isIosSafariHint,
  isRunningAsInstalledApp,
  readInstallEnvironment,
  shouldShowInstallHelp,
  writeFlag,
  type InstallKind,
} from '../install';

function copyFor(kind: InstallKind, needsSafari: boolean, canPrompt: boolean) {
  if (kind.platform === 'ios' && kind.tablet) {
    return {
      label: 'iPad',
      title: 'Keep Color Pop on iPad',
      steps: needsSafari
        ? [
            'Open this page in Safari. Chrome on iPad cannot save it as an app.',
            'Tap the Share button in the toolbar at the top (square with an arrow).',
            'Tap Add to Home Screen, then Add.',
          ]
        : [
            'Tap the Share button in the toolbar at the top (square with an arrow up).',
            'Tap Add to Home Screen.',
            'Tap Add. Color Pop will sit with your other apps.',
          ],
    };
  }
  if (kind.platform === 'ios') {
    return {
      label: 'iPhone',
      title: 'Keep Color Pop on iPhone',
      steps: needsSafari
        ? [
            'Open this page in Safari. Chrome on iPhone cannot save it as an app.',
            'Tap the Share button (the square with an arrow).',
            'Tap Add to Home Screen, then Add.',
          ]
        : [
            'Tap the Share button at the bottom (square with an arrow up).',
            'Scroll and tap Add to Home Screen.',
            'Tap Add. Color Pop will sit with your other apps.',
          ],
    };
  }
  if (kind.tablet) {
    return {
      label: 'Tablet',
      title: 'Keep Color Pop on your tablet',
      steps: canPrompt
        ? [
            'Tap Add Color Pop below.',
            'Confirm Install on the next screen.',
            'Open it from your home screen next time.',
          ]
        : [
            'Tap the three dots in the browser menu (usually at the top).',
            'Tap Add to Home screen or Install app.',
            'Tap Add. Color Pop will sit with your other apps.',
          ],
    };
  }
  return {
    label: 'Android',
    title: 'Keep Color Pop on Android',
    steps: canPrompt
      ? [
          'Tap Add Color Pop below.',
          'Confirm Install on the next screen.',
          'Open it from your home screen next time.',
        ]
      : [
          'Tap the three dots in the browser menu.',
          'Tap Add to Home screen or Install app.',
          'Tap Add. Color Pop will sit with your other apps.',
        ],
  };
}

export function InstallHelper() {
  const [kind, setKind] = useState<InstallKind | null>(null);
  const [needsSafari, setNeedsSafari] = useState(false);
  const [visible, setVisible] = useState(false);
  const { available, promptInstall } = useAndroidInstallPrompt();

  useEffect(() => {
    const sync = () => {
      const env = readInstallEnvironment();
      if (isRunningAsInstalledApp(env) || !shouldShowInstallHelp(env)) {
        setVisible(false);
        setKind(null);
        return;
      }
      const next = forcedInstallKind() ?? detectInstallKind(env);
      setKind(next);
      setNeedsSafari(next?.platform === 'ios' && !isIosSafariHint(env.userAgent));
      setVisible(Boolean(next));
    };
    sync();
    const standalone = window.matchMedia('(display-mode: standalone)');
    const fullscreen = window.matchMedia('(display-mode: fullscreen)');
    standalone.addEventListener('change', sync);
    fullscreen.addEventListener('change', sync);
    window.addEventListener('appinstalled', sync);
    window.addEventListener('resize', sync);
    return () => {
      standalone.removeEventListener('change', sync);
      fullscreen.removeEventListener('change', sync);
      window.removeEventListener('appinstalled', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);

  if (!visible || !kind) return null;

  const hideForNow = () => {
    writeFlag(INSTALL_LATER_KEY, 'session');
    setVisible(false);
  };
  const hideForever = () => {
    writeFlag(INSTALL_HIDE_KEY, 'local');
    setVisible(false);
  };
  const addNow = async () => {
    const accepted = await promptInstall();
    if (accepted) hideForever();
  };

  const copy = copyFor(kind, needsSafari, available);

  return <section className="install-help" aria-label="Add Color Pop as an app">
    <div className="install-help__row">
      <div>
        <p className="install-help__label">{copy.label}</p>
        <h2 className="install-help__title">{copy.title}</h2>
      </div>
      <button type="button" className="install-help__close" aria-label="Hide this tip" onClick={hideForNow}>
        <ToolIcon name="close" size={16} />
      </button>
    </div>
    <p className="install-help__lead">Save it like a real app so kids can open it without the browser bar.</p>
    <ol className="install-help__steps">
      {copy.steps.map((step, index) => <li key={step}>
        <span>{index + 1}</span>
        {step}
      </li>)}
    </ol>
    <div className="install-help__actions">
      {kind.platform === 'android' && available && <button type="button" className="profile-primary" onClick={() => void addNow()}>Add Color Pop</button>}
      <button type="button" className="profile-secondary" onClick={hideForNow}>Maybe later</button>
      <button type="button" className="install-help__mute" onClick={hideForever}>Don’t show again</button>
    </div>
  </section>;
}
