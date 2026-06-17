# SPA Phase 0 Migration Priority

Date: 2026-06-18

This priority list is based on the baseline route and capability matrix. The ordering favors user-visible business continuity first, then governance and operational depth, then cleanup-only work.

## P0 - Authentication And Core Transaction Loop

Goal: allow a normal user to complete the main marketplace loop in React without legacy prototype runtime support.

Routes and pages:

| Priority | Capability | Routes | Target React work |
|---|---|---|---|
| P0.1 | User/admin login and registration | `/login`, `/register`, `/admin/login` | Keep current React auth flow, replace plain anchors with router navigation, verify redirect query handling, compare registration against legacy skill/profile onboarding. |
| P0.2 | Home feed and task discovery | `/feed`, `/tasks` | Restore legacy mixed feed/task capabilities: categories, filters, pager, empty/error states, notification dot, and card actions. |
| P0.3 | Publish request/community content | `/post` | Restore categories/tags, content safety check, AI draft, attachment slots, request/community-post mode, and success panel behavior. |
| P0.4 | Detail, comments, and application actions | `/posts/:id`, legacy `/community-posts/:id` | Support request detail, community post detail or explicit redirect, comments, like/collect, application approval/rejection, and accept/apply actions. |
| P0.5 | Orders and completion | `/orders`, `/orders/:id` | Add stats, filters, pager, detail timeline, confirm-complete local refresh, AI order summary, review/dispute context links. |
| P0.6 | Reviews | `/reviews/new` | Load review target from order context or query, support readonly/success states, and replace full-page navigation with `useNavigate`. |

Exit criteria:

- A user can register/login, publish a demand, another user can discover/accept it, the order can be completed, and a review can be submitted in React.
- No P0 route depends on `window.location.reload()` for business success state.
- Legacy HTML URLs for P0 routes have known redirect targets.

## P1 - Trust, Communication, And Balance Flows

Goal: preserve the flows that protect transaction quality and user confidence.

| Priority | Capability | Routes | Target React work |
|---|---|---|---|
| P1.1 | Dispute create/detail | `/disputes/new`, `/disputes/:id` | Load order context, evidence upload, timeline, participant claims, jury/final result, and AI dispute summary. |
| P1.2 | Jury hall and voting | `/jury`, `/jury/voting`, `/jury/disputes/:id` | Add missing `/jury` SPA route/page, expose jury case list API, route metadata for `/jury/disputes/:id`, vote reason submission, and local post-vote state. |
| P1.3 | Wallet and frozen funds | `/wallet`, `/wallet/freeze` | Add filters, pager, transaction/freeze detail, linked order navigation, and stable deep refresh. |
| P1.4 | Messages | `/messages` | Replace generic table with conversations/thread view, read state updates, send message local refresh, and query-param entry from user/order pages. |
| P1.5 | Notifications | `/notifications` | Per-notification read, read-all local refresh, summary updates, preferences persistence, and target route navigation. |
| P1.6 | Profile, settings, credit | `/profile`, `/settings`, `/credit`, `/users/:id` | Replace full-page navigation/reloads, add session/security settings, public contact/reviews/service cards, and route-based credit user selection. |

Exit criteria:

- Dispute and jury routes support direct refresh.
- Wallet, message, and notification actions update local state.
- Profile/settings pages no longer use full document navigation for internal flows.

## P2 - AI User Features And AI Governance

Goal: migrate AI runtime capabilities without losing streaming, formatting, feedback, or admin operations.

| Priority | Capability | Routes | Target React work |
|---|---|---|---|
| P2.1 | AI assistant | `/ai/assistant` | Keep stream fallback, add conversation history, feedback buttons, reusable AI runtime component, and global/modal entry replacement if still required. |
| P2.2 | AI results | `/ai/results` | Replace raw JSON with legacy-equivalent result sections, errors, empty state, and navigation to candidate requests/users. |
| P2.3 | AI admin logs | `/admin/ai/logs` | Add filters, pagination, detail preview, retry/error linkage. |
| P2.4 | AI conversations | `/admin/ai/conversations` | Add conversation list and detail drawer/page. |
| P2.5 | AI feedback/errors/config | `/admin/ai/feedback`, `/admin/ai/errors`, `/admin/ai/config` | Add resolve/batch resolve/report, retry/create incident, config edit/audit preview. |

Exit criteria:

- User AI chat supports stream, rich text, copy, feedback, and history.
- AI governance pages no longer rely on `AdminGenericPage`.

## P3 - Admin Production Equivalence

Goal: replace generic admin payload rendering with specific operational pages.

| Priority | Capability | Routes | Target React work |
|---|---|---|---|
| P3.1 | Dashboard | `/admin/dashboard` | Restore legacy metric cards, operational links, and error/empty states. |
| P3.2 | Users | `/admin/users` | Filters, pagination, detail, status update, reason capture, and confirmation flow. |
| P3.3 | Transactions | `/admin/transactions` | Summary, filters, pagination, inspector/detail panel, export if legacy requires it. |
| P3.4 | Disputes/final adjudication | `/admin/disputes`, `/admin/disputes/final` | List/detail, evidence panes, jury summary, finalization form, and confirmation. |
| P3.5 | Content governance | `/admin/risk-content`, `/admin/sensitive-words`, `/admin/categories` | Risk resolution, batch review, category/tag/sensitive-word CRUD/import. |
| P3.6 | Audit, stats, system | `/admin/audit-log`, `/admin/stats`, `/admin/system` | Filters, charts/tables, backup restore/delete without `window.prompt`, message cleanup, and audit preview. |

Exit criteria:

- `AdminGenericPage` is no longer used for production admin modules.
- High-risk admin mutations use explicit React confirmation components.

## P4 - Runtime Switch, Build Cleanup, And Test Migration

Goal: perform technical cutover after functional parity is achieved.

| Priority | Capability | Target work |
|---|---|---|
| P4.1 | SPA navigation | Replace internal `<a href>`, `window.location.href`, and `window.location.reload()` in `frontend/src/spa` with `Link`, `NavLink`, `useNavigate`, and local state refresh. |
| P4.2 | SPA fallback | Update frontend server to return SPA `index.html` for business paths while keeping API/static/health handling separate. |
| P4.3 | Legacy redirects | Convert old HTML URLs such as `/screens/feed.html` and `/feed.html` to redirect-only behavior. |
| P4.4 | Build cleanup | Remove production generation of `pages/*.html` and prototype runtime assets only after parity. |
| P4.5 | Test migration | Rewrite prototype-dependent stage tests and add SPA route/navigation/mutation/build assertions. |

Exit criteria:

- Production build has one business HTML entry: `index.html`.
- `prototype-shell.mjs`, `prototypeRenderer.mjs`, and `UISource/screens` are not part of production runtime.
- Full SPA-oriented CI suite passes.

