import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected display error occurred.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('SnapWall UI error caught by boundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#F8F8F7] px-6 text-center text-[#141416]">
          <div className="max-w-md rounded-2xl border border-zinc-200 bg-white p-8">
            <h1 className="font-display text-xl font-semibold text-zinc-950">
              Something interrupted the studio
            </h1>
            <p className="mt-2 text-sm text-zinc-600">{this.state.message}</p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.reload();
              }}
              className="mt-6 rounded-lg bg-zinc-950 px-5 py-2.5 text-xs font-semibold text-white hover:bg-zinc-800"
            >
              Reload Studio
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
