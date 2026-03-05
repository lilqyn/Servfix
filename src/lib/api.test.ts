import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("apiFetch", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("sends credentials and guest header", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    localStorage.setItem("servfix-guest-id", "guest_123");
    await apiFetch<{ ok: boolean }>("/api/health");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:4000/api/health");
    expect(options.credentials).toBe("include");

    const headers = new Headers(options.headers);
    expect(headers.get("x-guest-id")).toBe("guest_123");
    expect(headers.get("Accept")).toBe("application/json");
  });

  it("refreshes once and retries on 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "Authorization required" }, 401))
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }, 200))
      .mockResolvedValueOnce(jsonResponse({ services: [] }, 200));
    vi.stubGlobal("fetch", fetchMock);

    const response = await apiFetch<{ services: unknown[] }>("/api/services");

    expect(response.services).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://localhost:4000/api/auth/refresh");
    expect(fetchMock.mock.calls[2]?.[0]).toBe("http://localhost:4000/api/services");
  });

  it("does not refresh auth endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "Invalid credentials" }, 401));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiFetch<{ user: unknown }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "user@example.com", password: "password" }),
      }),
    ).rejects.toThrow("Invalid credentials");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
