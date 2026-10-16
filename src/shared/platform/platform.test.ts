import { describe, it, expect, vi, beforeEach } from "vitest";

const capacitor = vi.hoisted(() => ({ native: false, platform: "web" }));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => capacitor.native,
    getPlatform: () => capacitor.platform,
  },
}));

import { isIOS, nativeMediaUrl, preferredStreamCodec } from "./index";

describe("platform helpers", () => {
  beforeEach(() => {
    capacitor.native = false;
    capacitor.platform = "web";
  });

  it("asks for aac only on ios", () => {
    expect(preferredStreamCodec()).toBeUndefined();

    capacitor.native = true;
    capacitor.platform = "android";
    expect(isIOS()).toBe(false);
    expect(preferredStreamCodec()).toBeUndefined();

    capacitor.platform = "ios";
    expect(isIOS()).toBe(true);
    expect(preferredStreamCodec()).toBe("aac");
  });

  it("routes remote media through the native proxy only in the native shell", () => {
    const url = "https://cdn.example.com/a.m4a";
    expect(nativeMediaUrl(url)).toBe(url);

    capacitor.native = true;
    capacitor.platform = "ios";
    const proxied = new URL(nativeMediaUrl(url));
    expect(proxied.origin).toBe(window.location.origin);
    expect(proxied.pathname).toBe("/_capacitor_http_interceptor_");
    expect(proxied.searchParams.get("u")).toBe(url);
    expect(nativeMediaUrl("blob:abc")).toBe("blob:abc");
  });
});
