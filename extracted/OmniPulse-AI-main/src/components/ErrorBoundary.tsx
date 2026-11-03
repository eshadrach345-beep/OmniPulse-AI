import React from 'react';

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error('UI crashed:', error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="min-h-full flex flex-col items-center justify-center gap-3 bg-slate-950 text-center p-6">
        <h1 className="text-lg font-bold text-white">Something went wrong</h1>
        <p className="text-sm text-slate-400 max-w-sm">An unexpected error occurred. Your saved work is safe. Reload the page to continue.</p>
        <button onClick={() => window.location.reload()} className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg px-4 py-2">Reload</button>
      </div>
    );
  }
}
