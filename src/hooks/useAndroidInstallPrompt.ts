import { useEffect, useRef, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function useAndroidInstallPrompt() {
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      promptRef.current = event as BeforeInstallPromptEvent;
      setAvailable(true);
    };
    const onInstalled = () => {
      promptRef.current = null;
      setAvailable(false);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = async () => {
    const event = promptRef.current;
    if (!event) return false;
    await event.prompt();
    const choice = await event.userChoice;
    promptRef.current = null;
    setAvailable(false);
    return choice.outcome === 'accepted';
  };

  return { available, promptInstall };
}
