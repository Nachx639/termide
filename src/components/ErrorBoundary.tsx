import React, { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Error Boundary component that catches JavaScript errors anywhere in the
 * child component tree, logs them, and displays a fallback UI.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary fallback={<text>Something went wrong</text>}>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo });

    // Log to console in development
    console.error("ErrorBoundary caught an error:", error);
    console.error("Component stack:", errorInfo.componentStack);

    // Call optional error handler
    this.props.onError?.(error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI for terminal
      return (
        <box
          style={{
            flexDirection: "column",
            padding: 2,
            borderStyle: "round",
            borderColor: "red",
          }}
        >
          <text style={{ fg: "red", bold: true }}>
            Something went wrong
          </text>
          <text style={{ fg: "gray", marginTop: 1 }}>
            {this.state.error?.message || "Unknown error"}
          </text>
          <text style={{ fg: "yellow", marginTop: 1 }}>
            Press Ctrl+R to reload
          </text>
        </box>
      );
    }

    return this.props.children;
  }
}

/**
 * Higher-order component to wrap a component with error boundary
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || "Component";

  const ComponentWithErrorBoundary = (props: P) => (
    <ErrorBoundary fallback={fallback}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  ComponentWithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;

  return ComponentWithErrorBoundary;
}

/**
 * Panel-specific error boundary with panel styling
 */
interface PanelErrorBoundaryProps extends ErrorBoundaryProps {
  panelName: string;
}

export class PanelErrorBoundary extends Component<PanelErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: PanelErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo });
    console.error(`Error in ${this.props.panelName}:`, error);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <box
          style={{
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            height: "100%",
            padding: 1,
          }}
        >
          <text style={{ fg: "red" }}>
            {this.props.panelName} error
          </text>
          <text style={{ fg: "gray", dim: true }}>
            {this.state.error?.message?.slice(0, 50) || "Unknown"}
          </text>
        </box>
      );
    }

    return this.props.children;
  }
}
