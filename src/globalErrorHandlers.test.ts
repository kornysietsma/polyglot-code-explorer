import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerGlobalErrorHandlers } from "./globalErrorHandlers";

describe("registerGlobalErrorHandlers", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("logs an uncaught error with its location", () => {
    registerGlobalErrorHandlers(window);

    const error = new Error("something in a d3 callback");
    window.dispatchEvent(
      new ErrorEvent("error", {
        error,
        message: error.message,
        filename: "Viz.tsx",
        lineno: 42,
        colno: 7,
      })
    );

    expect(console.error).toHaveBeenCalledWith(
      "Uncaught error at Viz.tsx:42:7:",
      error
    );
  });

  it("logs an unhandled promise rejection", () => {
    registerGlobalErrorHandlers(window);

    // jsdom has no PromiseRejectionEvent constructor, so raise the event by hand - all the
    // handler reads is `reason`.
    const event = new Event("unhandledrejection") as Event & {
      reason: unknown;
    };
    event.reason = new Error("a fetch nobody awaited");
    window.dispatchEvent(event);

    expect(console.error).toHaveBeenCalledWith(
      "Unhandled promise rejection:",
      event.reason
    );
  });
});
