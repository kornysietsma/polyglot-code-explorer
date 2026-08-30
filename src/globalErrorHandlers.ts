/**
 * Anything thrown outside React's render - a D3 event callback, a timer, a rejected promise -
 * bypasses the error boundary entirely, and by default leaves nothing behind but whatever the
 * browser chooses to print. These handlers make such failures explicit and greppable.
 *
 * `addEventListener("error")` rather than assigning `window.onerror`, so this never clobbers
 * another handler (or gets clobbered by one).
 */
export function registerGlobalErrorHandlers(target: Window = window) {
  target.addEventListener("error", (event: ErrorEvent) => {
    console.error(
      `Uncaught error at ${event.filename}:${event.lineno}:${event.colno}:`,
      event.error ?? event.message
    );
  });
  target.addEventListener(
    "unhandledrejection",
    (event: PromiseRejectionEvent) => {
      console.error("Unhandled promise rejection:", event.reason);
    }
  );
}
