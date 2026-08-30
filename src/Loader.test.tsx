import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Loader, { MAX_DATA_FILE_BYTES } from "./Loader";

/**
 * These cover the two guards that stand between a failed fetch and a misleading error: without
 * them an HTTP failure reaches `json()` and is reported as a JSON syntax error, and a file too
 * large to parse fails somewhere deep inside the fetch instead of saying so.
 *
 * Driving the real `Loader` rather than a extracted helper keeps the test honest - both guards
 * end in the same rendered error report the user actually sees. Neither case reaches `App`.
 */
const stubFetch = (dataResponse: Partial<Response>) => {
  const fetchStub = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("_state.json")) {
      // No sidecar state file - the ordinary case, and not what these tests are about.
      return Promise.resolve({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response);
    }
    return Promise.resolve({
      headers: new Headers(),
      ...dataResponse,
    } as Response);
  });
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
};

describe("Loader", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports an HTTP failure rather than letting it reach JSON parsing", async () => {
    stubFetch({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.reject(new Error("json() should never be called")),
    });

    render(<Loader />);

    expect(await screen.findByText("Errors loading data:")).toBeInTheDocument();
    expect(screen.getByText(/500 Internal Server Error/)).toBeInTheDocument();
  });

  it("refuses a data file too large for the browser to parse, before reading the body", async () => {
    const cancel = vi.fn(() => Promise.resolve());
    const tooBig = MAX_DATA_FILE_BYTES + 1;
    stubFetch({
      ok: true,
      headers: new Headers({ "Content-Length": String(tooBig) }),
      body: { cancel } as unknown as Response["body"],
      json: () => Promise.reject(new Error("json() should never be called")),
    });

    render(<Loader />);

    expect(await screen.findByText("Errors loading data:")).toBeInTheDocument();
    expect(
      screen.getByText(/536.9 MB this browser can parse/)
    ).toBeInTheDocument();
    await waitFor(() => expect(cancel).toHaveBeenCalled());
  });

  it("lets a file under the limit through to parsing", async () => {
    const json = vi.fn(() => Promise.resolve({ notAVersion: true }));
    stubFetch({
      ok: true,
      headers: new Headers({
        "Content-Length": String(MAX_DATA_FILE_BYTES - 1),
      }),
      json,
    });

    render(<Loader />);

    // It fails the version check instead - which proves the size guard let it past.
    expect(
      await screen.findByText(/No version in JSON data file/)
    ).toBeInTheDocument();
    expect(json).toHaveBeenCalled();
  });
});
