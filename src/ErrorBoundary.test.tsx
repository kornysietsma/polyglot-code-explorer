import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ErrorBoundary from "./ErrorBoundary";

const Boom = ({ message }: { message: string }) => {
  throw new Error(message);
};

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // React logs the caught error itself, and so do we - neither is a test failure, but both
    // are noise in the test output.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("renders its children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>all is well</p>
      </ErrorBoundary>
    );

    expect(screen.getByText("all is well")).toBeInTheDocument();
  });

  it("shows the error instead of unmounting when a child throws", () => {
    render(
      <ErrorBoundary>
        <Boom message="bad selected node" />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong:")).toBeInTheDocument();
    expect(screen.getByText("Error:")).toBeInTheDocument();
    expect(screen.getByText("bad selected node")).toBeInTheDocument();
  });

  it("shows the component stack, so the failing component is named", () => {
    render(
      <ErrorBoundary>
        <Boom message="bad selected node" />
      </ErrorBoundary>
    );

    const stack = screen.getByText(/Boom/, { selector: "pre" });
    expect(stack).toBeInTheDocument();
  });

  it("logs the error as well as rendering it", () => {
    render(
      <ErrorBoundary>
        <Boom message="bad selected node" />
      </ErrorBoundary>
    );

    expect(console.error).toHaveBeenCalledWith(
      "Unhandled error while rendering:",
      expect.objectContaining({ message: "bad selected node" }),
      expect.stringContaining("Boom")
    );
  });
});
