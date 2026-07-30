#!/usr/bin/env node
// Fetches curated Spotify listening data and writes it to data/music.json.
//
// Requires SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and
// SPOTIFY_REFRESH_TOKEN, either as real environment variables (GitHub
// Actions secrets in CI) or in a local .env file (see .env.example).
// See README.md > "My Music setup" for how to obtain these.
//
// No npm dependencies: uses Node's built-in fetch (Node 18+).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT, "data", "music.json");

// Edit this list to change which playlists show up in "Featured playlists",
// or set SPOTIFY_FEATURED_PLAYLISTS to a comma-separated list of playlist
// IDs to override it without touching code (handy as a GitHub secret/var).
const DEFAULT_FEATURED_PLAYLIST_IDS = [];

const TOP_ITEMS_LIMIT = 8;
const RECENTLY_PLAYED_LIMIT = 10;

async function loadDotEnv(filePath) {
  let content;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    return; // no .env file present, that's fine (e.g. in CI)
  }
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(
      `Missing required environment variable: ${name}\n` +
        "Set it in a local .env file (copy .env.example) for local runs, " +
        "or as a GitHub Actions secret for the workflow.\n" +
        "See README.md > 'My Music setup' for how to obtain it."
    );
    process.exit(1);
  }
  return value;
}

async function getAccessToken(clientId, clientSecret, refreshToken) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`token refresh returned ${res.status}: ${body}`);
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error("token refresh response had no access_token");
  }
  return data.access_token;
}

async function spotifyFetch(endpoint, accessToken) {
  const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // No content, e.g. nothing currently playing — a normal, expected state.
  if (res.status === 204) return null;

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${endpoint} returned ${res.status}: ${body}`);
  }

  return res.json();
}

function mapTrack(track) {
  if (!track) return null;
  return {
    name: track.name,
    artists: (track.artists || []).map((a) => a.name),
    album: track.album?.name ?? null,
    albumImageUrl: track.album?.images?.[0]?.url ?? null,
    url: track.external_urls?.spotify ?? null,
    durationMs: track.duration_ms ?? null,
  };
}

function mapArtist(artist) {
  return {
    name: artist.name,
    imageUrl: artist.images?.[0]?.url ?? null,
    url: artist.external_urls?.spotify ?? null,
    genres: artist.genres ?? [],
  };
}

function mapPlaylistSummary(playlist) {
  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description || null,
    imageUrl: playlist.images?.[0]?.url ?? null,
    url: playlist.external_urls?.spotify ?? null,
    ownerName: playlist.owner?.display_name ?? null,
    trackCount: playlist.tracks?.total ?? null,
  };
}

async function fetchNowPlaying(accessToken) {
  const data = await spotifyFetch("/me/player/currently-playing", accessToken);
  if (!data || !data.item) return null;
  return {
    ...mapTrack(data.item),
    isPlaying: Boolean(data.is_playing),
    progressMs: data.progress_ms ?? null,
  };
}

async function fetchRecentlyPlayed(accessToken) {
  const data = await spotifyFetch(
    `/me/player/recently-played?limit=${RECENTLY_PLAYED_LIMIT}`,
    accessToken
  );
  if (!data?.items) return [];
  return data.items.map((item) => ({
    ...mapTrack(item.track),
    playedAt: item.played_at,
  }));
}

async function fetchTopArtists(accessToken) {
  const data = await spotifyFetch(
    `/me/top/artists?time_range=short_term&limit=${TOP_ITEMS_LIMIT}`,
    accessToken
  );
  if (!data?.items) return [];
  return data.items.map(mapArtist);
}

async function fetchTopTracks(accessToken) {
  const data = await spotifyFetch(
    `/me/top/tracks?time_range=short_term&limit=${TOP_ITEMS_LIMIT}`,
    accessToken
  );
  if (!data?.items) return [];
  return data.items.map(mapTrack);
}

async function fetchFeaturedPlaylists(accessToken, ids) {
  const playlists = [];
  for (const id of ids) {
    try {
      const data = await spotifyFetch(
        `/playlists/${id}?fields=id,name,description,images,external_urls,owner(display_name),tracks(total)`,
        accessToken
      );
      if (data) playlists.push(mapPlaylistSummary(data));
    } catch (err) {
      console.warn(`Skipping featured playlist ${id}: ${err.message}`);
    }
  }
  return playlists;
}

// Runs a data-fetching step in isolation so one failing endpoint (rate
// limit, missing scope, temporary outage) doesn't take down the whole run.
async function safely(label, fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    console.warn(`Warning: ${label} failed, using fallback. ${err.message}`);
    return fallback;
  }
}

async function main() {
  await loadDotEnv(path.join(ROOT, ".env"));

  const clientId = requireEnv("SPOTIFY_CLIENT_ID");
  const clientSecret = requireEnv("SPOTIFY_CLIENT_SECRET");
  const refreshToken = requireEnv("SPOTIFY_REFRESH_TOKEN");

  const overridePlaylistIds = (process.env.SPOTIFY_FEATURED_PLAYLISTS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const playlistIds =
    overridePlaylistIds.length > 0 ? overridePlaylistIds : DEFAULT_FEATURED_PLAYLIST_IDS;

  let accessToken;
  try {
    accessToken = await getAccessToken(clientId, clientSecret, refreshToken);
  } catch (err) {
    console.error(`Could not obtain a Spotify access token: ${err.message}`);
    console.error(
      "Check that SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REFRESH_TOKEN " +
        "are correct and that the refresh token hasn't been revoked (re-run " +
        "scripts/get-refresh-token.mjs if it has)."
    );
    process.exit(1);
  }

  const [nowPlaying, recentlyPlayed, topArtists, topTracks, featuredPlaylists] =
    await Promise.all([
      safely("currently playing", () => fetchNowPlaying(accessToken), null),
      safely("recently played", () => fetchRecentlyPlayed(accessToken), []),
      safely("top artists", () => fetchTopArtists(accessToken), []),
      safely("top tracks", () => fetchTopTracks(accessToken), []),
      safely(
        "featured playlists",
        () => fetchFeaturedPlaylists(accessToken, playlistIds),
        []
      ),
    ]);

  const output = {
    updatedAt: new Date().toISOString(),
    nowPlaying,
    recentlyPlayed,
    topArtists,
    topTracks,
    featuredPlaylists,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf-8");

  console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)}`);
  console.log(`  now playing: ${nowPlaying ? nowPlaying.name : "nothing"}`);
  console.log(`  recently played: ${recentlyPlayed.length}`);
  console.log(`  top artists: ${topArtists.length}`);
  console.log(`  top tracks: ${topTracks.length}`);
  console.log(`  featured playlists: ${featuredPlaylists.length}`);
}

main().catch((err) => {
  console.error("Unexpected error while fetching Spotify data:", err);
  process.exit(1);
});
