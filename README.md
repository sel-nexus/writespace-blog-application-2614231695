# WriteSpace

A complete browser-local blog demonstration built with React 18, JavaScript JSX, Vite, React Router 6, and Tailwind CSS. It is a static frontend, not a shared publishing service.

## Important limits

**Demo only: do not enter real passwords or sensitive information.** Passwords, roles, sessions, accounts, and posts are stored in this browser's localStorage. Client route/ownership checks can be bypassed by anyone controlling the browser. There is no backend, API, database, encryption, password recovery, backup, synchronization, or cross-device account system. HTTPS protects asset delivery, not browser-stored passwords. Clearing browser data or changing origin can permanently lose the local data. Concurrent tabs can overwrite updates.

The fixed public demonstration administrator is **admin / admin**. It is not a registered account and cannot be deleted. Use made-up credentials for self-registration or administrator-created accounts.

## Run locally

Requires Node.js 20+ and npm; Node 22 was used for sandbox tests and Node 20 for the verified container build.

```sh
cd frontend
npm ci --no-bin-links
cp .env.example .env
npm run dev
```

Defaults: development at http://127.0.0.1:5173, production preview at http://127.0.0.1:4173. See frontend/.env.example for public host/port/test settings. No application secrets or remote API URL is needed. Static assets have no runtime environment configuration; changing deployment container environment does not change compiled application data or behavior.

## Features and routes

| Route | Behavior |
|---|---|
| / | Public introduction and newest three local post previews |
| /login | Local credential entry; admin-first demo check |
| /register | Unique case-insensitive username and forced ordinary role |
| /blogs | All local posts newest-first; ownership controls |
| /blog/:id | Full escaped plain-text post with preserved line breaks |
| /write | Create with UUID, creation time, and current session authorship |
| /edit/:id | Owner/admin edit; immutable identity/time/authorship preserved |
| /admin | Local statistics, newest five posts, writing/account actions |
| /users | Create ordinary/admin accounts; confirmed protected deletion |

Guests opening protected routes go to /login; ordinary users opening admin routes go to /blogs. Already authenticated auth-route visitors go to their role home. Logout clears the session before returning home. Deletion requires confirmation. Cancel leaves data unchanged. Deleting an account does not delete its posts; its stale session fails closed on the next read.

The dashboard's exact four metrics are Total Posts, Registered Users, Published Posts, and Drafts. All persisted posts are published; Drafts is always zero. The fixed admin is excluded from registered counts. There is no draft workflow or status field.

Storage keys are writespace_posts, writespace_users, writespace_session. Full arrays/records are validated. Corrupt or unavailable collections show a warning and safe-empty affected records, disable unsafe mutation, and preserve raw stored bytes. Missing keys are ordinary empty collections. Failed writes never claim persistence or navigate as saved. If account creation succeeds but session persistence fails, the account remains and the UI accurately tells the user to sign in later.

## Automated verification

All scripts invoke package entrypoints directly, so disabled npm bin links are supported.

```sh
cd frontend
npm test
# One feature example:
npm test -- tests/accounts.test.jsx
NODE_ENV=production npm run build
node node_modules/@playwright/test/cli.js install chromium
npm run test:e2e
```

Playwright config is frontend/playwright.config.js; it launches a production preview when one is not already present. Its single worker uses isolated real browser storage, not API interception. Browser warnings/errors and page exceptions fail tests. Journeys click through real links, check stored records and ownership, confirm/cancel actions, reload persistence, and mobile/tablet/desktop layout. Screenshots plus accessibility trees, computed styles, and HTML are generated in frontend/test-results/ for human review.

Verification in this run: ten unit/component suites passed 841 tests. A subsequent deletion-order regression added one test; affected final unit suites passed 306 tests. The resulting catalog has 842 cases. The full 61-case browser run initially passed 59 and exposed two defects; source/capture fixes were applied without weakening assertions and the affected 28 cases then all passed. All 61 journeys have passing evidence across the full and targeted runs. Independent structural test critic: PASS, score 1.00, zero high failures, round 2. Full command/result history is in the pipeline's test_report.yaml, not committed source.

There are no backend API or database integration tests because those components do not exist. Cross-feature registration/write/edit/read/admin/account flows are covered in the browser.

## Static container and hosting

From repository root:

```sh
docker build -t writespace-frontend frontend
docker run --rm -p 8080:80 writespace-frontend
```

frontend/Dockerfile builds a clean npm-ci Vite bundle and serves it with nginx on 0.0.0.0:80. frontend/nginx.conf has SPA try_files fallback and no backend proxy. Root / returns the SPA for health checks. The image build, nginx configuration, and root/deep-link shell delivery were verified in the sandbox; the final source image is rebuilt before handoff. Product records are never stored in the container.

The pipeline's AWS/ECR/ECS/ALB/CloudFront deployment is a later DevOps responsibility. Actual AWS rollout, edge routing, health, HTTPS, and rollback are **not claimed verified** by Developer. vercel.json is a separate Vercel-only nested frontend build/output/rewrite configuration; it does not configure AWS.

## Design and dependency notes

The approved development plan uses editorial typography, solid reading surfaces, a bounded floating-card color accent, and SVG book/crown roles. This intentionally avoids full-page gradient wallpaper and emoji under the stage's UI rules while retaining required product copy. Only useState/useEffect manage application state; no Context or state library was added.

`npm audit` reports **14 unresolved advisories: 5 moderate, 7 high, 2 critical**, including development tooling and dependencies constrained by the requested Router 6/Tailwind 3 architecture. The build passes, but this is **not a clean security audit**. No forced or unapproved stack-major upgrade was applied. Do not expose Vite/test tooling publicly or treat this demo as secure. Before broader use, review the dependencies and approve compatible remediation; any trusted/shared publishing system requires a new architecture.

The HLD's p95 targets are provisional and require an agreed reference device. This run verifies functional journeys and responsive behavior, not those device-specific latency targets, AWS service objectives, or accessibility certification.
