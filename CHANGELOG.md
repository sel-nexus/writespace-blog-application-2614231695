# WriteSpace brownfield changelog

## Added
- Shared light/dark appearance across all routes. A visible, keyboard-operable button exposes its current mode, next action and pressed state. Navigation retains selection; reload resets to light. No preference storage or Context/state library was added.
- One-time starter-post bootstrap using `writespace_bootstrap_v1` (`{version:1, initialized:true}`). True first use writes two ordinary demo posts, then the marker. Samples use valid UUIDs/timestamps and the fixed demo administrator authorship, without creating registered users.
- Unit/component and browser coverage for bootstrap, failure/partial-write recovery, preserved emptiness, all appearance route families, responsive/keyboard behavior and browser storage isolation.

## Changed and fixed
- `frontend/src/utils/storage.js`: additive guarded marker protocol; existing posts/users/session schemas and keys remain unchanged.
- `frontend/src/utils/bootstrap.js`: preserve existing arrays including empty arrays; never overwrite corrupt/unavailable data; successful post write followed by marker failure cannot duplicate on next startup.
- `frontend/src/App.jsx`: effect-time initialization before data views, StrictMode replay safety, unknown-route no-mutation behavior, explicit bootstrap status, and disabled post controls/submission capture when initialization is uncertain. Login, registration, users and logout continue through their own validation/storage boundaries.
- `frontend/src/components/AppShell.jsx`, `AppearanceToggle.jsx`, `Navbar.jsx`, `frontend/src/utils/appearance.js`, `frontend/tailwind.config.js`: prop-composed transient appearance and alpha-capable semantic light/dark colors. Existing typography, pages, layouts, routing and CSS-only animation remain; `index.css` is unchanged.
- `frontend/src/utils/posts.js`: a throwing/unavailable confirmation capability now returns `confirmation-unavailable` without writing; list/detail UI retains data and reports failure.
- New `frontend/tests/bootstrap.test.js`, `bootstrapApp.test.jsx`, `appearance.test.jsx`; added confirmation-exception cases in `reading.test.jsx`.
- Existing discovery, identity, reading and dashboard component fixtures explicitly identify intentionally empty initialized stores where appropriate; strict assertions retained.
- New `frontend/e2e/bootstrap.spec.js`, `appearance.spec.js`; existing discovery/authoring/dashboard/accounts browser fixtures identify intentional emptiness. Starter delete-all checks return through real Dashboard navigation and assert exact paired metric values. Focus assertion uses the toggle's changed accessible action name after activation.
- `README.md` documents new semantics and actual outcomes; pipeline plan/worklist/test report/metadata/manifest and refreshed code graph provide handoff evidence.

## Compatibility and migration
No Post/User/Session format change or destructive migration. Existing stored post arrays, even `[]` without a marker, are preserved and marker-only finalized. A valid marker with missing posts means intentionally empty and never reseeds. Deleting all posts retains the marker; clearing all browser storage removes it and begins a new installation. Corrupt raw bytes remain untouched. Reload after marker-write failure retries only completion. Reverting the app does not require removing the marker; old code ignores this additive key. Appearance adds no persistence/migration.

## Verification
Baseline: 842/842 unit cases. Final: 960/960 unit/component cases in 13 files; independent test critic PASS 1.00, zero high fails, round 2; final complete Chromium production suite 85/85 passed. Explicit production Vite build and Docker build passed. Nginx configuration and six root/deep-link SPA-shell smoke paths passed. Browser captures include screenshots, accessibility trees, HTML and computed styles. No skipped tests or backend/API/database/compose layers were added.

## Known limits
This remains a browser-local non-sensitive demo, not trusted shared publishing: plaintext passwords, client-editable roles, origin isolation and no backup/cross-device/cross-tab guarantee. Dependency install/build still reports 14 inherited advisories (5 moderate, 7 high, 2 critical); no forced major upgrade was performed. AWS rollout/edge health/HTTPS and agreed-device provisional latency gates remain downstream/unverified, not claimed by this stage.
