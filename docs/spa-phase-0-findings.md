# SPA Phase 0 Findings

Date: 2026-06-18

This document records the concrete findings from implementing phase 0 planning. It should be treated as input to phase 1+ implementation work, not as a code change record.

## Files Reviewed

- `plan/真正生产等价SPA改造计划.md`
- `frontend/src/routes.mjs`
- `frontend/src/spa/routes.ts`
- `frontend/src/spa/App.tsx`
- `frontend/src/spa/api.ts`
- `frontend/src/spa/pages/*.tsx`
- `frontend/src/prototype-shell.mjs`
- `scripts/build-frontend.mjs`
- `scripts/validate-stage-*.mjs`
- `scripts/validate-frontend-build.mjs`

CodeGraph is configured in AGENTS.md, but it is not initialized for this repository. The phase 0 inventory was therefore produced with direct file reads and `rg`.

## Key Findings

1. The project is still a hybrid runtime.
   - `frontend/server.mjs` imports `renderPrototypeHtml` and renders route HTML for business paths.
   - `scripts/build-frontend.mjs` emits prototype pages and copies `prototype-shell.mjs`.
   - Many stage validation scripts still assert that prototype pages load `/assets/app/prototype-shell.mjs`.

2. SPA routing mostly mirrors legacy routing, but not completely.
   - `frontend/src/routes.mjs` defines `jury-hall` at `/jury`.
   - `frontend/src/spa/routes.ts` does not define `/jury`.
   - `App.tsx` manually adds `/jury/disputes/:id` for `jury-voting`, but this path is not in `appRoutes`, so metadata, title, and future route-level auth/nav capabilities will be inconsistent.

3. React pages exist for most route IDs, but parity is generally partial.
   - User routes are functional skeletons with API access, but filters, pagination, stateful mutations, timeline/detail sections, and legacy-specific actions are incomplete.
   - Admin routes mostly fall through to `AdminGenericPage`, so admin production workflows are not equivalent.
   - AI assistant has streaming/rich text basics, but feedback/history/global runtime parity is not complete.

4. SPA navigation is not yet SPA-clean.
   - `App.tsx` shell navigation uses plain `<a href>`.
   - Multiple pages use plain internal anchors.
   - Several mutations use `window.location.reload()`.
   - Several flows use `window.location.href`.
   - Some pages read `window.location.search` or `window.location.pathname` directly instead of React Router APIs.

5. React API client is broad, but not fully aligned with legacy usage.
   - Missing or unclear React client coverage includes jury hall list, message thread/read-thread, request application approval/rejection, and account session/password APIs.
   - Admin mutation methods exist for many modules, but React pages do not expose them yet.

6. Current test semantics still conflict with the final SPA target.
   - Stage validation scripts from stage 01 and many later stages import `renderPrototypeHtml` or read `prototype-shell.mjs`.
   - `scripts/validate-frontend-build.mjs` already contains an SPA-oriented assertion that `index.html` does not load `prototype-shell.mjs`, but broader stage scripts still expect the old runtime.

## Required Decisions Captured

- `/jury` should be kept as the SPA jury hall unless product explicitly deprecates the hall page. Default: keep and implement `JuryHallPage`.
- `/jury/disputes/:id` should be a first-class SPA route in `appRoutes`, not only an ad hoc `Route` in `App.tsx`.
- `/community-posts/:id` is still supported by legacy matching but has no SPA route entry. Default: add React support or redirect to a canonical post-detail route with explicit content-type handling.
- `AdminGenericPage` should be treated as a temporary fallback only. Default: no admin route is `done` until it has a module-specific React page.
- Full-page reloads after mutations are not acceptable parity. Default: any route using reload for business state remains `partial`.

## Follow-Up Inputs For Later Phases

Use these checks when starting implementation phases:

- Route gap check: compare `frontend/src/routes.mjs` and `frontend/src/spa/routes.ts`; fail if a legacy business route lacks an SPA target or documented redirect/deprecation.
- Navigation check: search `frontend/src/spa` for `href="/`, `window.location.href`, and `window.location.reload()`.
- Legacy dependency check: search build/server/test scripts for `renderPrototypeHtml`, `prototype-shell.mjs`, `UISource/screens`, and `frontend/dist/pages`.
- API parity check: compare `api.*` calls in `frontend/src/prototype-shell.mjs` against methods exposed in `frontend/src/spa/api.ts`.
- Admin fallback check: fail production-equivalence status while any production admin route resolves to `AdminGenericPage`.

## Acceptance Result For Phase 0

Phase 0 is complete when the following files are present and reviewed:

- `docs/spa-phase-0-baseline-matrix.md`
- `docs/spa-phase-0-migration-priority.md`
- `docs/spa-phase-0-findings.md`

The documents intentionally do not modify runtime behavior. They provide the baseline needed to split and verify the later SPA migration phases.

