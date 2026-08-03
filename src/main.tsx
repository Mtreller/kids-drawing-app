import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

type ErrorBoundaryState = { error: Error | null };

class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="startup-error">
          <div className="startup-error-card">
            <div className="startup-error-icon">🎨</div>
            <h1>Color Pop needs a refresh</h1>
            <p>{this.state.error.message || 'The app could not start.'}</p>
            <button onClick={() => window.location.reload()}>Reload app</button>
            <small>Version 2.1</small>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

async function clearLegacyAppCache() {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // Cache cleanup must never prevent the drawing app from starting.
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing app root element.');

void clearLegacyAppCache().finally(() => {
  ReactDOM.createRoot(rootElement).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );
});
