import { describe, it, expect } from "vitest";
import { playlistListId, trackItems, uniqueTracks } from "./lists";
import type { Track } from "@/shared/types";

function track(id: string, extra: Partial<Track> = {}): Track {
  return { id, title: `t${id}`, artists: `a${id}`, coverUrl: "", durationMs: 0, playCount: 0, ...extra };
}

describe("carplay lists", () => {
  it("maps tracks to car list items, keeping only http artwork", () => {
    const items = trackItems([
      track("1", { coverUrl: "https://img.example.com/1.jpg" }),
      track("2", { coverUrl: "blob:abc", title: "", artists: "" }),
      track(""),
    ]);
    expect(items).toEqual([
      { id: "1", title: "t1", subtitle: "a1", artworkUrl: "https://img.example.com/1.jpg" },
      { id: "2", title: "Unknown title", subtitle: undefined, artworkUrl: undefined },
    ]);
  });

  it("dedupes history, keeping the most recent play first", () => {
    expect(uniqueTracks([track("1"), track("2"), track("1"), track("3")]).map((t) => t.id)).toEqual(["1", "2", "3"]);
  });

  it("uses the same playlist context string as the playlist page", () => {
    expect(playlistListId("abc")).toBe("playlist:abc");
  });
});
