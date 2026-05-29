# Firebase Cloud Sync setup

## Console

1. Create a Firebase project (Spark plan), region **europe-west**.
2. Create Firestore in **Production mode** (not Test mode).
3. Deploy [`firestore.rules`](../../firestore.rules) from the repo root.
4. Enable **Google** sign-in under Authentication.
5. Create an OAuth client of type **Chrome extension** with your extension ID (unpacked or Web Store).
6. Set `oauth2.client_id` in [`manifest.json`](../../manifest.json) to that client ID (required for `chrome.identity.getAuthToken`).

## Extension config

1. Copy `src/shared/firebase.config.example.js` to `src/shared/firebase.config.js` (gitignored).
2. Fill `apiKey`, `projectId`, and `authDomain`.
3. Reload the extension. Cloud Sync appears in Settings when configured.

## Data on Firestore

Path: `users/{uid}/series/{playlistId}` — metadata, progress map, `updatedAt`. License and settings are **not** stored on Firestore.
