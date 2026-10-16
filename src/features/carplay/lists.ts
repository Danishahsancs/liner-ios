// shapes sent to the native CarPlay templates (ios/App/App/CarPlay.swift)
import type { Track } from "@/shared/types";

export interface CarPlayItem {
  id: string;
  title: string;
  subtitle?: string;
  artworkUrl?: string;
  // opens a sub-list (playlist) instead of starting playback
  browsable?: boolean;
}

export interface CarPlayList {
  id: string;
  title: string;
  systemImage?: string;
  emptyText?: string;
  items: CarPlayItem[];
}

export const RECENT_LIST = "recent";
export const LIKED_LIST = "liked";
export const PLAYLISTS_LIST = "playlists";

// same context string the playlist page uses
export function playlistListId(playlistId: string): string {
  return `playlist:${playlistId}`;
}

function artwork(url: string | undefined): string | undefined {
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

export function trackItems(tracks: Track[]): CarPlayItem[] {
  return tracks
    .filter((t) => t.id)
    .map((t) => ({
      id: t.id,
      title: t.title || "Unknown title",
      subtitle: t.artists || undefined,
      artworkUrl: artwork(t.coverUrl),
    }));
}

// dedupe by id, keeping the first (most recent) occurrence
export function uniqueTracks(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  return tracks.filter((t) => t.id && !seen.has(t.id) && seen.add(t.id));
}
