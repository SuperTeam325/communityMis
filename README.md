# Community MIS Frontend

## Production SPA Build

The production frontend is a Vite React SPA. Run:

```bash
npm run build
```

The build writes to `frontend/dist` and must contain:

- `index.html`
- `config.json`
- `config.template.json`
- `routes.json`
- `manifest.json`
- hashed Vite assets under `assets/`

The build must not contain prototype route pages or the legacy runtime:

- no `frontend/dist/pages/*.html`
- no `frontend/dist/assets/app/prototype-shell.mjs`
- no copied `ui/screens` or prototype `styles` tree

`manifest.json` marks the runtime with `type: "vite-react-spa"` and `frontendMode: "spa"`.

## Production Routing

The frontend service serves static assets, runtime config, health checks, route metadata, and React history fallback. API paths are excluded from fallback and should be handled by the backend service.

Useful endpoints:

- `/frontend-health`
- `/config.json`
- `/routes.json`
- `/manifest.json`

Legacy prototype HTML URLs redirect to the matching SPA route. For example, `/screens/feed.html` redirects to `/feed`; `/community-posts/:id` redirects to `/posts/:id`; `/jury/voting?disputeId=:id` redirects to `/jury/disputes/:id`.

## Validation

For stage 8+ SPA acceptance:

```bash
npm run typecheck
npm run build
npm run test:stage22
npm run test:stage07
npm run test:frontend-build
```

Seeded local accounts used by browser and stage acceptance:

- `user_a / user123456`
- `user_b / user123456`
- `admin_main / admin123456`

Stage scripts validate the React SPA route manifest, production build artifacts, browser fallback behavior, and backend API flows instead of prototype HTML pages.
