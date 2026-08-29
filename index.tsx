import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// --- Error Boundary Component ---
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center', backgroundColor: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ width: '5rem', height: '5rem', backgroundColor: '#ffe4e6', color: '#e11d48', borderRadius: '9999px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.25rem', marginBottom: '1.5rem' }}>⚠️</div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 900, color: '#0f172a', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '-0.05em' }}>Application Error</h1>
          <p style={{ color: '#64748b', maxWidth: '28rem', margin: '0 auto 2rem auto', fontWeight: 500, lineHeight: 1.6 }}>The application encountered an unexpected error during initialization.</p>
          <pre style={{ fontSize: '0.75rem', backgroundColor: '#0f172a', color: '#94a3b8', padding: '1.5rem', borderRadius: '1rem', maxWidth: '42rem', overflowX: 'auto', textAlign: 'left', marginBottom: '2rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid rgba(255,255,255,0.05)' }}>{this.state.error?.message}\n\n{this.state.error?.stack}</pre>
          <button onClick={() => window.location.reload()} style={{ padding: '1rem 2rem', backgroundColor: '#4f46e5', color: 'white', borderRadius: '1rem', fontWeight: 900, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer', border: 'none', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>Refresh Page</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);