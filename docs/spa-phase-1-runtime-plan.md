# SPA Phase 1 Runtime Plan

Date: 2026-06-18

## Summary

Phase 1 introduces a switchable SPA runtime skeleton. The existing prototype renderer remains available by default during migration, while `FRONTEND_MODE=spa` turns business paths into true React Router history fallback.

## Runtime Mode

- Default mode: `FRONTEND_MODE` unset, legacy prototype route rendering remains active.
- SPA mode: `FRONTEND_MODE=spa`, all non-static business paths return `frontend/dist/index.html`.
- `/api/*` is intentionally excluded from frontend fallback and returns 404 from the frontend server.
- Static assets, `/config.json`, `/manifest.json`, `/routes.json`, and `/frontend-health` keep dedicated handling.
- Legacy HTML URLs such as `/screens/feed.html` and `/feed.html` continue to redirect to canonical paths like `/feed`.

## Route And Navigation Changes

- SPA route metadata now includes `auth`, `nav`, and `legacyPaths`.
- `/jury` is represented as `jury-hall`.
- `/jury/disputes/:id` is a first-class SPA route for jury voting deep links.
- User and admin shells use React Router `Link`/`NavLink`.
- Entry, auth, feed, task, order, wallet, and not-found navigation use SPA links where they are part of the runtime skeleton.

## Build And Manifest

- Vite SPA build, config files, route manifest, and deployment manifest remain generated.
- Prototype pages and runtime assets are still emitted in this phase for compatibility.
- `manifest.json` now records `frontendMode`; final removal of prototype pages remains phase 7 work.

## Acceptance Checks

Run:

```powershell
npm run typecheck
npm run build
npm run test:stage01
npm run test:frontend-build
```

Expected SPA mode behavior:

- `/feed`, `/tasks`, `/orders/demo`, `/disputes/demo`, `/jury`, `/jury/disputes/demo`, and `/admin/dashboard` return React `index.html`.
- `/screens/feed.html` redirects to `/feed`.
- `/api/health` is not swallowed by frontend history fallback.
- Missing static assets under `/assets/*` return 404.

## Remaining Work

- Page-level `window.location.reload()` and mutation local refresh are phase 2 work.
- React page production parity remains governed by the phase 0 matrix.
- Prototype build output deletion is intentionally deferred to phase 7.

