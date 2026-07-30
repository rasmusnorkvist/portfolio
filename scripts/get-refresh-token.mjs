#!/usr/bin/env node
// One-time local helper to obtain a Spotify refresh token for this project.
// This never runs in CI and nothing it prints is written to a file.
//
// Step 1 — print the login URL:
//   node scripts/get-refresh-token.mjs --client-id=YOUR_CLIENT_ID
//
// Open the printed URL, log in, and approve access. Spotify redirects you
// to your redirect URI with a "?code=..." query param — the page itself
// doesn't need to load or exist, just copy the "code" value out of the
// browser's address bar.
//
// Step 2 — exchange the code for a refresh token:
//   node scripts/get-refresh-token.mjs \
//     --client-id=YOUR_CLIENT_ID \
//     --client-secret=YOUR_CLIENT_SECRET \
//     --code=PASTE_THE_CODE_HERE
//
// The redirect URI must exactly match one registered on your Spotify app
// (Dashboard > your app > Settings > Redirect URIs). If you don't have a
// server to redirect to, register http://127.0.0.1:8888/callback and use
// that for both steps — see README.md > "My Music setup".

const SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-read-recently-played",
  "user-top-read",
  "playlist-read-private",
].join(" ");

function arg(name) {
  const flag = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(flag));
  return found ? found.slice(flag.length) : undefined;
}

const clientId = arg("client-id") || process.env.SPOTIFY_CLIENT_ID;
const clientSecret = arg("client-secret") || process.env.SPOTIFY_CLIENT_SECRET;
const redirectUri =
  arg("redirect-uri") || process.env.SPOTIFY_REDIRECT_URI || "http://127.0.0.1:8888/callback";
const code = arg("code");

if (!clientId) {
  console.error("Missing --client-id (or set SPOTIFY_CLIENT_ID in your environment).");
  process.exit(1);
}

if (!code) {
  const authUrl = new URL("https://accounts.spotify.com/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", SCOPES);

  console.log("Step 1: open this URL, log in with the Spotify account you want to feature, and approve access:\n");
  console.log(authUrl.toString());
  console.log(`\nMake sure ${redirectUri} is registered as a Redirect URI on your Spotify app first.`);
  console.log("\nAfter approving, copy the 'code' value from the address bar you land on, then run:\n");
  console.log(
    `  node scripts/get-refresh-token.mjs --client-id=${clientId} --client-secret=YOUR_CLIENT_SECRET --code=PASTE_CODE_HERE --redirect-uri=${redirectUri}\n`
  );
  process.exit(0);
}

if (!clientSecret) {
  console.error("Missing --client-secret (needed to exchange the code for tokens).");
  process.exit(1);
}

const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

const res = await fetch("https://accounts.spotify.com/api/token", {
  method: "POST",
  headers: {
    Authorization: `Basic ${basic}`,
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  }),
});

const data = await res.json().catch(() => ({}));

if (!res.ok) {
  console.error("Token exchange failed:", data);
  console.error(
    "\nCommon causes: the code was already used (they're single-use), it expired " +
      "(they last ~10 minutes), or --redirect-uri doesn't exactly match what you used in step 1."
  );
  process.exit(1);
}

console.log("\nSuccess. Save this as the SPOTIFY_REFRESH_TOKEN GitHub Actions secret:\n");
console.log(data.refresh_token);
console.log("\n(Printed to your terminal only — not written to any file or committed.)");
