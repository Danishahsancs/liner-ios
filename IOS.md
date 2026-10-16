# Liner for iOS

This repo wraps Liner's renderer in a [Capacitor](https://capacitorjs.com) iOS shell (`ios/`), reusing the
phone layout and the `src/shared/platform` abstraction from the Android port. GitHub Actions builds an
**unsigned** `.ipa` on a macOS runner. You sign it when you sideload it.

- Minimum iOS version: **16.4** (Tailwind v4's CSS and Vite 8's default build target need Safari 16.4+).
- Bundle id: `com.hkamori.liner` (sideloading tools usually rewrite it).

## Getting the IPA

1. Open **Actions → iOS Unsigned IPA** on GitHub. It runs on every push to `main`; use **Run workflow** to start it by hand.
2. Open the finished run and download the **liner-ios-unsigned-ipa** artifact.
3. Unzip it. GitHub wraps artifacts in a zip. Inside is `Liner-<version>-unsigned.ipa`.

## Sideloading from Windows

An unsigned IPA won't install as-is. A sideloading tool signs it with your Apple ID.

### Option A: Sideloadly (easiest from Windows)

1. Install [iTunes and iCloud from Apple's website](https://support.apple.com/en-us/106372). Don't use the Microsoft Store versions; Sideloadly needs Apple's drivers.
2. Install [Sideloadly](https://sideloadly.io) and connect the iPhone by USB. Tap **Trust** on the phone.
3. Drag the `.ipa` into Sideloadly, enter your Apple ID and click **Start**. An app-specific password works if you use 2FA.
4. On the iPhone, turn on **Settings → Privacy & Security → Developer Mode** (iOS 16+) and reboot when asked.
5. Go to **Settings → General → VPN & Device Management**, tap your Apple ID and choose **Trust**.

### Option B: AltStore / SideStore

Install AltServer on Windows, follow its setup to put AltStore on the phone, then open the `.ipa` from the
Files app in AltStore. SideStore can refresh the app on-device without a PC.

### Free Apple ID limits

- The app **expires after 7 days**. Re-sign it with Sideloadly, or let AltStore/SideStore refresh it.
- You can have at most 3 sideloaded apps at once.
- A paid developer account ($99/yr) gives 1-year signatures.

## What's iOS-specific

| Area | What the port does |
| --- | --- |
| Notch / home indicator | `viewport-fit=cover`, `contentInset: "never"`; the layout pads with `env(safe-area-inset-*)` (same code as Android). Whole-page rubber-banding is off (`ios.scrollEnabled: false`). Font inflation on rotation, tap flash and the long-press callout are off. Inputs don't zoom on focus. |
| Background audio | `UIBackgroundModes: audio` + an `AVAudioSession` `.playback` category (also ignores the silent switch). |
| Lock screen / Control Center | `@capgo/capacitor-media-session` fills Now Playing (title, artist, artwork, position) and handles play/pause/next/previous/scrub. |
| Streaming | iOS asks the server for **AAC** (`preferredCodec: "aac"`) and prefers mp4/AAC on the direct-YouTube path. WebM/Opus support in WKWebView depends on the iOS version. Audio streams **straight from the CDN** so AVFoundation can buffer progressively. Capacitor's iOS proxy downloads each request in full before handing it over. If a direct load fails, the app falls back to the proxy for the rest of the session. |
| Pitch / reverb effects | The Web Audio graph is only built once you turn an effect on. The current track then reloads through the same-origin proxy, because Web Audio can't read cross-origin samples. Until then, playback is a plain `<audio>` element, the most reliable path for background playback. |
| Request signing (Rust → Wasm) | Same Wasm signer as Android, running in WKWebView. If WebAssembly is unavailable, a warning is logged and requests go out unsigned. |
| WebGL background (Kawarp) | Plain WebGL 1 with `highp` shaders, which iOS supports. If context creation fails or the context is lost (e.g. backgrounding), the canvas hides, the CSS blur stays and the engine rebuilds on restore. |
| Deep links | `liner://…` registered via `CFBundleURLTypes`, handled by the existing `DeeplinkHandler`. |
| Fallback relay | ATS exception for plain-http `edge.tryliner.fun` only (mirrors Android's network security config). |
| CarPlay | See below. |

## CarPlay

There are two levels of CarPlay support.

**1. Now Playing (works with any install, including a free Apple ID).** CarPlay's own *Now Playing* screen shows
whatever Liner is playing (title, artist, artwork, progress) with play/pause, next/previous and scrubbing. This
comes from the same Now Playing info as the lock screen. Start music on the phone, then control it from the car.

**2. The full Liner app on the car screen (needs Apple's CarPlay entitlement).** A Liner icon appears in CarPlay
with three tabs:

- **Recent**: recently played tracks.
- **Liked**: up to 200 liked songs.
- **Playlists**: tap a playlist to see its tracks.

Tapping a track plays it with the rest of that list as the queue, then opens CarPlay's Now Playing screen. The
lists refresh when your library or account changes.

- How it's built: native templates in `ios/App/App/CarPlay.swift`, fed by the web app through a small in-app plugin
  (`src/features/carplay`).
- Apps run inside the web view, so **Liner has to be running on the phone**. If CarPlay starts Liner on its own, the
  car shows "Open Liner on your iPhone" until you open it.
- The app declares `com.apple.developer.carplay-audio` in `ios/App/App/App.entitlements`, but **iOS only honours it if
  the signing profile includes it**.
  - Apple grants that entitlement on request, through the CarPlay form on developer.apple.com, and only to paid
    developer accounts.
  - A free Apple ID via Sideloadly/AltStore can't include it. The app installs and plays fine, but the Liner icon
    won't appear in CarPlay. Level 1 still works.
  - With an approved paid account: open the project in Xcode on a Mac, pick your team and run on the phone. Or
    create an App ID with the CarPlay capability and a matching provisioning profile, then sign the IPA with it.

## What doesn't work (or is untested) on iOS

**Known not to work:**

- **Lockdown Mode** disables WebAssembly, so API requests can't be signed and the server will likely reject them.
  Exclude Liner under *Settings → Privacy & Security → Lockdown Mode → Configure Web Browsing*.
- **Pitch/reverb in the background:** once an effect is on, audio runs through an `AudioContext`. iOS may suspend
  that in the background or under the lock screen. Turn effects off for reliable background play.
- **Desktop-only features** stay hidden or are no-ops: the overlay window, Touch Bar, auto-updater, window controls,
  custom cache folder and the cover service worker. WKWebView has no service workers for custom schemes.
- **No auto-update:** each new build has to be sideloaded again.
- **No swipe-back gesture:** navigation uses the in-app back controls.
- **Status bar colour** follows the iOS light/dark setting. If you force the app theme opposite to the system,
  the clock and battery icons can be hard to read.

**Not verified.** It was built on Windows without a Mac or iPhone, so all of this needs testing on a device:

- That the Xcode build itself succeeds. CI is the first real compile, so check the Actions log.
- Background playback and lock-screen controls in practice, including whether WebKit's own Now Playing
  integration conflicts with the plugin.
- Anything on a real CarPlay screen. The CarPlay templates compile in CI but have never run; the first real test
  is Xcode's CarPlay simulator, or a car with an entitlement-signed build.
- Whether the Liner server honours `preferredCodec: "aac"`. If it still returns WebM/Opus, playback depends on
  the iOS version.
- Direct CDN streaming without CORS, and seeking through the proxy (Range requests are forwarded, but each range is buffered whole).
- The `x-platform` header reports `macos` on iOS, because the user agent contains "Mac OS X". The same
  user-agent sniffing reports Android as `linux`.

## Building locally (needs a Mac)

```bash
pnpm install
pnpm ios:sync            # vite build --mode capacitor + cap sync ios
open ios/App/App.xcodeproj
```

Plugins are wired through Swift Package Manager (`ios/App/CapApp-SPM`). There's no CocoaPods step.
