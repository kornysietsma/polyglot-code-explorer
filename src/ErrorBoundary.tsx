import { Component, type ErrorInfo, type ReactNode } from "react";

import ErrorReport from "./ErrorReport";

type Props = { children: ReactNode };
type State = { error: Error | undefined; componentStack: string | undefined };

/**
 * Without this, an exception thrown while rendering anything under `App` unmounts the whole
 * tree and leaves a blank page with only a console warning - React says so itself: "Consider
 * adding an error boundary".
 *
 * React offers no hook equivalent of `componentDidCatch`, so this is the app's only class
 * component. It deliberately catches *render*-time failures only: `Viz.tsx`'s WebGL
 * context-loss recovery runs in native canvas event handlers, which never reach a boundary and
 * must keep handling themselves. Anything thrown outside render is caught by the global
 * handlers in `globalErrorHandlers.ts` instead.
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: undefined, componentStack: undefined };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // The console is where a developer looks first; the rendered report is for whoever is only
    // using the app. Both, always - the point of this work is that failures are never silent.
    console.error(
      "Unhandled error while rendering:",
      error,
      info.componentStack
    );
    this.setState({ componentStack: info.componentStack ?? undefined });
  }

  override render() {
    const { error, componentStack } = this.state;
    if (error === undefined) {
      return this.props.children;
    }
    return (
      <ErrorReport
        title="Something went wrong:"
        lines={[`${error.name}:`, error.message]}
        detail={componentStack}
      />
    );
  }
}

export default ErrorBoundary;
