# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Sali is a Finnish-language personal workout diary, built as an installable PWA. It is a static site with no build step, no package manager, no tests and no linter. UI strings are in Finnish.

## Running

Serve the directory with any static server (a service worker and Firebase auth need http(s), not `file://`), e.g. `python3 -m http.server 8000`, then open `http://localhost:8000`. There is nothing to build or test. Deployment is just hosting the files statically.

`make_icon.py` regenerates the PNG icons; it is not part of runtime.

## Architecture

- `index.html` loads React 18, ReactDOM, **Babel standalone** and the Firebase v10 compat SDKs from CDNs, then `firebase-config.js`, then `app.js` as `<script type="text/babel">`. JSX is compiled in the browser at load time, so don't add `import`/`export` or bundler-only syntax. Everything shares global scope.
- `app.js` is the whole app (~700 lines): constants and design tokens (`C` colors, `S` shared style objects), inline SVG icon components, small components (`Stepper`, `Spinner`), and one large `App` component holding all state. Styling is inline style objects plus a small `<style>` block in `index.html`; there is no CSS framework.
- Three tabs (`TABS`: log, history, progress), switchable via bottom nav or horizontal swipe handled by global touch listeners in `App`.
- Data: Google sign-in via Firebase Auth; workouts live in Firestore at `users/{uid}/workouts/{id}`, ordered by a numeric `ts` field and subscribed with `onSnapshot`. `firestore.rules` restricts each user to their own subtree. Firestore offline persistence is enabled. Large writes go through `runBatched` (chunks of 400).
- Legacy migration: on first sign-in, if the user's Firestore collection is empty, workouts from the old `localStorage` key (`KEY = "gym_v5"`) are uploaded.
- Workout shape: a workout contains muscle `blocks` (`newBlock`), each with `exercises` (`newEx`), each with `sets` (`newSet`, reps/weight as strings). Muscle groups come from `MUSCLES`.
- `firebase-config.js` holds the (public) Firebase web config for project `sali-sovellus`.

## Service worker (`sw.js`)

Stale-while-revalidate cache named `gym-vN` with a precache list (`ASSETS`) of app files and CDN scripts. When you add or rename a precached file, or want clients to drop old cached assets, add it to `ASSETS` and bump the `CACHE` version string; old caches are deleted on activate. Because of this cache, changes may not appear until the worker updates — hard reload or bump the version when testing.
