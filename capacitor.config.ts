import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.hkamori.liner",
  appName: "Liner",
  webDir: "dist",
  android: {
    // keep webview debuggable via chrome://inspect in debug builds
    webContentsDebuggingEnabled: true,
  },
  ios: {
    // web content runs edge to edge under the notch / home indicator; the
    // layout pads itself with env(safe-area-inset-*) (viewport-fit=cover)
    contentInset: "never",
    // the app scrolls its own panes; this stops the whole page rubber-banding
    scrollEnabled: false,
    allowsLinkPreview: false,
    // Safari > Develop on a Mac can attach to the webview (ios 16.4+)
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    // electron runs with webSecurity off + injected cors headers; on native
    // the native http stack (and its same-origin proxy) stands in for that.
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
