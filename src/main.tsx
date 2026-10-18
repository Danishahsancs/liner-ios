import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { RootErrorBoundary } from "@/shared/ui";
import { initGlobalErrorHandlers } from "@/shared/utils/globalErrorHandlers";
import { initTelemetry } from "@/shared/telemetry";
import { initBackgroundStorageAnalytics } from "@/shared/utils/cacheManager";
import { initClientVisitorSession } from "@/shared/api/visitorSession";
import { isIOS } from "@/shared/platform";
import { initBundleStampLog } from "@/shared/utils/bundleStampLog";
import { installNativeRequestHeaderShim } from "@/shared/platform/nativeRequestHeaders";

// android/ios: apply the youtube/apple header rewrite electron does in its main process, before any request
installNativeRequestHeaderShim();

// Initialize global uncaught error, telemetry listeners, background storage tracker and visitor session
initGlobalErrorHandlers();
initTelemetry();
initBackgroundStorageAnalytics();
initClientVisitorSession();
initBundleStampLog();

// ios: CarPlay lists + playback (lazy so other platforms never load it)
if (isIOS()) {
  void import("@/features/carplay").then((m) => m.initCarPlay());
}

const rootElement = document.getElementById("root");

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </React.StrictMode>,
  );
}

