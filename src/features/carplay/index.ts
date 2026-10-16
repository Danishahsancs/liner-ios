// carplay (ios only): feeds the native CarPlay templates in
// ios/App/App/CarPlay.swift and plays what gets tapped on the car screen.
// the car shows three tabs: recently played, liked songs, playlists (each
// playlist opens its track list). lists are only fetched while a car is
// connected, and refreshed when the library or the signed-in user changes.
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { api, getAuthSession, toClientTrack } from "@/shared/api";
import { playerEngine } from "@/features/player";
import type { Track } from "@/shared/types";
import {
  LIKED_LIST,
  PLAYLISTS_LIST,
  RECENT_LIST,
  playlistListId,
  trackItems,
  uniqueTracks,
  type CarPlayList,
} from "./lists";

interface LinerCarPlayPlugin {
  getState(): Promise<{ connected: boolean }>;
  setRoot(options: { tabs: CarPlayList[] }): Promise<void>;
  showList(options: { requestId: string; list: CarPlayList }): Promise<void>;
  addListener(event: "connected", cb: (e: { connected: boolean }) => void): Promise<PluginListenerHandle>;
  addListener(event: "select", cb: (e: { listId: string; itemId: string }) => void): Promise<PluginListenerHandle>;
  addListener(
    event: "browse",
    cb: (e: { requestId: string; listId: string; itemId: string }) => void,
  ): Promise<PluginListenerHandle>;
}

const LinerCarPlay = registerPlugin<LinerCarPlayPlugin>("LinerCarPlay");

const MAX_LIKED = 200;

// tracks behind every list currently on the car screen, so a tap can start
// that track with the rest of its list as the queue
const tracksByList = new Map<string, Track[]>();
let connected = false;
let refreshing: Promise<void> | null = null;
let refreshAgain = false;

async function loadRecent(): Promise<Track[]> {
  const res = await api.getHistory(undefined, 60);
  return uniqueTracks((res.items || []).map((entry) => toClientTrack(entry.track))).slice(0, 40);
}

async function loadLiked(): Promise<Track[]> {
  const tracks: Track[] = [];
  let cursor: string | undefined;
  do {
    const page = await api.listLikedTracks(100, cursor);
    tracks.push(...page.items.map(({ track }) => toClientTrack(track)));
    cursor = page.nextCursor ?? undefined;
  } while (cursor && tracks.length < MAX_LIKED);
  return tracks.slice(0, MAX_LIKED);
}

async function buildTabs(): Promise<CarPlayList[]> {
  const signedIn = Boolean(getAuthSession()?.accessToken);
  const signInText = "Sign in to Liner on your iPhone";
  if (!signedIn) {
    tracksByList.clear();
    return [
      { id: RECENT_LIST, title: "Recent", systemImage: "clock", emptyText: signInText, items: [] },
      { id: LIKED_LIST, title: "Liked", systemImage: "heart", emptyText: signInText, items: [] },
      { id: PLAYLISTS_LIST, title: "Playlists", systemImage: "music.note.list", emptyText: signInText, items: [] },
    ];
  }

  const [recent, liked, playlists] = await Promise.all([
    loadRecent().catch(() => [] as Track[]),
    loadLiked().catch(() => [] as Track[]),
    api.listPlaylists().then((r) => r.items || []).catch(() => []),
  ]);
  tracksByList.set(RECENT_LIST, recent);
  tracksByList.set(LIKED_LIST, liked);

  return [
    { id: RECENT_LIST, title: "Recent", systemImage: "clock", emptyText: "Nothing played yet", items: trackItems(recent) },
    { id: LIKED_LIST, title: "Liked", systemImage: "heart", emptyText: "No liked songs yet", items: trackItems(liked) },
    {
      id: PLAYLISTS_LIST,
      title: "Playlists",
      systemImage: "music.note.list",
      emptyText: "No playlists yet",
      items: playlists.map((p) => ({
        id: p.id,
        title: p.title || "Untitled playlist",
        subtitle: p.description || undefined,
        browsable: true,
      })),
    },
  ];
}

// coalesces bursts of refresh triggers into at most one extra run
function refresh(): Promise<void> {
  if (!connected) return Promise.resolve();
  if (refreshing) {
    refreshAgain = true;
    return refreshing;
  }
  refreshing = (async () => {
    do {
      refreshAgain = false;
      try {
        await LinerCarPlay.setRoot({ tabs: await buildTabs() });
      } catch (err) {
        console.warn("[CarPlay] failed to refresh lists", err);
      }
    } while (refreshAgain && connected);
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function browse(requestId: string, listId: string, itemId: string): Promise<void> {
  if (listId !== PLAYLISTS_LIST) return;
  const id = playlistListId(itemId);
  let list: CarPlayList;
  try {
    const res = await api.getUserPlaylist(itemId);
    const tracks = (res.items || []).map((item) => toClientTrack(item.track));
    tracksByList.set(id, tracks);
    list = { id, title: res.playlist.title, emptyText: "This playlist is empty", items: trackItems(tracks) };
  } catch {
    list = { id, title: "", emptyText: "Couldn't load this playlist", items: [] };
  }
  await LinerCarPlay.showList({ requestId, list }).catch(() => {});
}

function select(listId: string, itemId: string): void {
  const tracks = tracksByList.get(listId);
  const track = tracks?.find((t) => t.id === itemId);
  if (!tracks || !track) return;
  const context = listId.startsWith("playlist:") ? listId : listId === LIKED_LIST ? "liked" : null;
  void playerEngine.playTrack(track, tracks, context, track.coverUrl || null);
}

let started = false;

export function initCarPlay(): void {
  if (started) return;
  started = true;

  void LinerCarPlay.addListener("connected", (e) => {
    connected = e.connected;
    if (connected) void refresh();
  });
  void LinerCarPlay.addListener("select", (e) => select(e.listId, e.itemId));
  void LinerCarPlay.addListener("browse", (e) => void browse(e.requestId, e.listId, e.itemId));

  window.addEventListener("library:changed", () => void refresh());
  window.addEventListener("auth:changed", () => void refresh());

  // a car may already be connected when the phone app starts
  void LinerCarPlay.getState()
    .then((s) => {
      connected = s.connected;
      if (connected) void refresh();
    })
    .catch(() => {});
}
