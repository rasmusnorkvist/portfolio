# Portfolio Website

A single-page portfolio (`index.html`) for Rasmus Norkvist, built with Tailwind CSS (via CDN) and vanilla JS. No build step — open it locally with a static server, or deploy the repo as-is to GitHub Pages.

## Local development

```
node serve.mjs
```

Serves the project root at `http://localhost:3000`.

## My Music setup

The "My music" section on the page reads from `data/music.json`, a static file that a scheduled GitHub Actions workflow (`.github/workflows/update-spotify.yml`) regenerates daily by calling the Spotify Web API. The browser never talks to Spotify directly and never sees any Spotify credentials — it only ever fetches the JSON file this repo already contains.

### 1. Create a Spotify developer app

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and log in with the account whose listening data you want to feature.
2. Click **Create app**. Name/description can be anything.
3. In **Settings**, add a Redirect URI. If you don't have a server to redirect to, `http://127.0.0.1:8888/callback` works fine — you only need the URL to exist for one manual step below, it doesn't need to respond to anything.
4. Note the app's **Client ID** and **Client Secret**.

### 2. Obtain a refresh token once, locally

This is a one-time step run on your machine — it's never part of the deployed site or the CI workflow.

```
node scripts/get-refresh-token.mjs --client-id=YOUR_CLIENT_ID
```

This prints a Spotify login URL. Open it, log in, and approve access. You'll land on your redirect URI with a `?code=...` in the address bar — the page itself can show an error, that's fine, just copy the `code` value. Then run:

```
node scripts/get-refresh-token.mjs \
  --client-id=YOUR_CLIENT_ID \
  --client-secret=YOUR_CLIENT_SECRET \
  --code=PASTE_THE_CODE_HERE
```

This prints a refresh token. It's shown in your terminal only — nothing is written to disk.

### 3. Add the GitHub repository secrets

In your repo: **Settings → Secrets and variables → Actions → New repository secret**. Add:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REFRESH_TOKEN`

These are the only credentials the workflow needs, and they're never exposed to the browser.

### 4. Run the workflow manually once

**Actions → Update Spotify data → Run workflow**. This fetches your data, writes `data/music.json`, and commits it (only if it actually changed) with the message `chore: update Spotify data`. After that it also runs automatically once a day.

### 5. Enable GitHub Pages

**Settings → Pages → Source: Deploy from a branch → main / (root)**. No build step is needed since the site is static.

### Customizing

- **Featured playlists** — edit `DEFAULT_FEATURED_PLAYLIST_IDS` at the top of `scripts/fetch-spotify-data.mjs` with the playlist IDs you want to feature (the ID is the part of a playlist URL after `/playlist/`). Alternatively, set a `SPOTIFY_FEATURED_PLAYLISTS` secret/variable to a comma-separated list of IDs to override it without touching code.
- **Update schedule** — edit the `cron` line in `.github/workflows/update-spotify.yml` (currently daily at 06:17 UTC).
- **How much data** — `TOP_ITEMS_LIMIT` and `RECENTLY_PLAYED_LIMIT` near the top of `scripts/fetch-spotify-data.mjs`.

### Testing locally

```
cp .env.example .env
# fill in .env with your real values
node scripts/fetch-spotify-data.mjs
```

The script loads `.env` automatically if present (and it's gitignored, so it's never committed). Running it with no credentials set at all fails immediately with a clear message telling you what's missing, rather than a stack trace.

### Security notes

- `SPOTIFY_CLIENT_SECRET` and `SPOTIFY_REFRESH_TOKEN` only ever exist as GitHub Actions secrets or in your local, gitignored `.env` — never in the frontend, never in `data/music.json`.
- The workflow requests only `contents: write` permission — enough to commit the updated JSON file, nothing more.
- If a Spotify API call fails (rate limit, missing scope, temporary outage), that one section falls back to empty/null instead of failing the whole run — except the token refresh itself, which does fail the run with a clear error, since without it nothing else can succeed.
