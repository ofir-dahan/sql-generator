'use client';

import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    // Log error details but don't crash the app
    console.warn('Error caught by boundary:', error.message);
    
    // If it's a MobX error, try to recover silently
    if (error.message.includes('MobX') || error.message.includes('mobx')) {
      console.debug('MobX-related error caught and handled');
      // Try to reset the error state after a short delay
      setTimeout(() => {
        this.setState({ hasError: false, error: undefined });
      }, 1000);
    }
  }

  render() {
    if (this.state.hasError) {
      // Check if it's a MobX error
      if (this.state.error?.message.includes('MobX') || this.state.error?.message.includes('mobx')) {
        // For MobX errors, show a minimal message and auto-recover
        return (
          <div className="p-4 bg-yellow-900 text-yellow-200 rounded-md">
            <p className="text-sm">Development tools conflict detected. Refreshing...</p>
          </div>
        );
      }
      
      // For other errors, show full error boundary
      return (
        <div className="p-4 bg-red-900 text-red-200 rounded-md">
          <h2 className="text-lg font-bold mb-2">Something went wrong</h2>
          <p className="text-sm">{this.state.error?.message}</p>
          <button 
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="mt-2 px-3 py-1 bg-red-700 hover:bg-red-600 rounded text-sm"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
