# SPA Phase 0 Baseline Matrix

Date: 2026-06-18

This document is the phase 0 baseline for the production-equivalent SPA migration. It maps every current production legacy route to its target React SPA route, page owner, known API dependencies, and parity status.

## Status Legend

| Status | Meaning |
|---|---|
| `done` | React page appears production-equivalent for the legacy capability. |
| `partial` | React page exists, but lacks interactions, filters, pagination, local mutation refresh, SPA navigation, or full API usage. |
| `api-gap` | React page exists, but API shape or client coverage is incomplete or unclear. |
| `route-gap` | Legacy production route has no matching SPA route entry. |
| `legacy-only` | Capability exists in `prototype-shell.mjs` but has no dedicated React implementation. |
| `deprecate-candidate` | Capability may be removed, but needs an explicit product reason. |

## Route Parity Matrix

| Legacy route ID | Legacy source / URL | Target SPA route | React page or frame | Key API dependencies | Parity status | Notes |
|---|---|---|---|---|---|---|
| `entry` | `index.html` -> `/` | `/` | `EntryPage` | none | `partial` | Uses plain anchors for internal navigation. |
| `login` | `screens/login.html` -> `/login` | `/login` | `LoginPage` | `auth.login`, `auth.me` | `partial` | Auth flow exists; register link still uses plain anchor. |
| `register` | `screens/register.html` -> `/register` | `/register` | `RegisterPage` | `verification.sendEmail`, `auth.register`, `auth.me` | `partial` | Email verification and registration exist; compare against legacy skill tag/profile onboarding. |
| `feed` | `screens/feed.html` -> `/feed` | `/feed` | `FeedPage` | React: `requests.list`; legacy: `feed.list`, `categories.list`, `notifications.list`, request apply | `partial` | React feed is a simple request list; legacy mixed feed, category filter, pager, notification dot, community posts, and accept actions are not equivalent. |
| `tasks` | `screens/tasks.html` -> `/tasks` | `/tasks` | `TasksPage` | `requests.list` | `partial` | React lacks legacy filters, pager, state rendering, card actions, and SPA links. |
| `post` | `screens/post.html` -> `/post` | `/post` | `PostPage` | React: `requests.create`, `files.upload`, `ai.requestDraft`; legacy also uses `categories.list`, `tags.list`, `content.check`, community post creation | `partial` | React form is simplified and only posts requests; legacy supports category/tag selection, content check, AI draft, community post mode, image slots, and success panels. |
| `messages` | `screens/messages.html` -> `/messages` | `/messages` | `MessagesPage` | React: `messages.list`, `messages.send`; legacy also uses `messages.thread`, `messages.readThread`, notifications | `partial` | React is table + send form and reloads after send; legacy supports conversation/thread experience. |
| `profile` | `screens/profile.html` -> `/profile` | `/profile` | `ProfilePage` | `users.me`, `communityPosts.list`, `requests.list`, `orders.list`, `collections.me`, `files.upload`, `users.avatar` | `partial` | Richer than early stub, but still uses `window.location.*`, plain anchors, and reload after avatar update. |
| `post-detail` | `screens/post-detail.html` -> `/posts/:id`; legacy also matches `/community-posts/:id` | `/posts/:id` | `RequestDetailPage` | React: `requests.detail`, `requestComments.list/create`, `requests.accept`; legacy also supports `requests.applications`, approve/reject, community post detail, like, collect, comment likes | `partial` | React covers request details/comments/accept in simplified form; community post detail route is not a SPA route. |
| `user-public` | `screens/user-public.html` -> `/users/:id` | `/users/:id` | `UserPublicPage` | `users.public`, `users.follow`, `users.unfollow`, `users.contact` | `partial` | Basic public profile and follow exist; contact flow uses plain link and legacy service cards/reviews/contact details need parity check. |
| `notifications` | `screens/notifications.html` -> `/notifications` | `/notifications` | `NotificationsPage` | `notifications.list`, `notifications.readAll`, `settings.me`, `settings.updateMe` | `partial` | Summary/preferences exist; read-all reloads and per-card read/link behavior from legacy is incomplete. |
| `settings` | `screens/settings.html` -> `/settings` | `/settings` | `SettingsPage` | `settings.me`, `settings.updateMe`, legacy also uses `auth.changePassword`, `auth.sessions`, `auth.revokeSession`, `auth.revokeOtherSessions` | `partial` | Preferences form exists; account security and session management from legacy are missing. |
| `credit` | `screens/credit.html` -> `/credit` | `/credit` | `CreditPage` | React: `users.me` or `users.credit`; legacy: `users.credit` with selected user | `partial` | Query-driven user ID handling remains outside router metadata; verify own-credit payload shape. |
| `wallet` | `screens/wallet.html` -> `/wallet` | `/wallet` | `WalletPage` | `wallet.me`, `wallet.transactions` | `partial` | React displays balance and rows; legacy filters, pager, linked orders, and transaction states need parity. |
| `wallet-freeze` | `screens/wallet-freeze.html` -> `/wallet/freeze` | `/wallet/freeze` | `WalletFreezePage` | `wallet.freezes` | `partial` | React displays rows only; legacy filter, pager, and business links need parity. |
| `orders` | `screens/orders.html` -> `/orders` | `/orders` | `OrdersPage` | `orders.list` | `partial` | React list lacks legacy stats, role/status filters, pager, panels, and SPA links. |
| `order-detail` | `screens/order-detail.html` -> `/orders/:id` | `/orders/:id` | `OrderDetailPage` | `orders.detail`, `orders.confirm`, legacy also uses `ai.orderSummary` | `partial` | Confirm action reloads; legacy detail actions, timeline, dispute/review context, and AI summary need parity. |
| `review` | `screens/review.html` -> `/reviews/new` | `/reviews/new` | `ReviewPage` | `orders.review`, legacy also uses `orders.reviews` | `partial` | React requires manual order ID and redirects by `window.location.href`; legacy readonly/success states are missing. |
| `dispute-create` | `screens/dispute-create.html` -> `/disputes/new` | `/disputes/new` | `DisputeCreatePage` | `orders.dispute`, `files.upload`, legacy also loads `orders.detail` | `partial` | React requires manual order ID and redirects by full page navigation. |
| `dispute-detail` | `screens/dispute-detail.html` -> `/disputes/:id` | `/disputes/:id` | `DisputeDetailPage` | `disputes.detail`, `files.upload`, `disputes.evidence`, legacy also uses `ai.disputeSummary`, `disputes.juryResult` | `partial` | React lacks legacy timeline, evidence panes, result display, and AI summary. |
| `jury-hall` | `jury.html` -> `/jury` | `/jury` | none | Legacy: `jury.disputes` | `route-gap` | `frontend/src/routes.mjs` has this route; `frontend/src/spa/routes.ts` does not. Must become `JuryHallPage` or be explicitly deprecated. |
| `jury-voting` | `screens/jury-voting.html` -> `/jury/voting`; legacy also matches `/jury/disputes/:id` | `/jury/voting` and `/jury/disputes/:id` | `JuryVotingPage` plus manual extra `<Route>` | `jury.dispute`, `jury.vote` | `partial` | React reads `window.location` directly and reloads after vote. `/jury/disputes/:id` is not in `appRoutes`, so route metadata/title/nav are inconsistent. |
| `help` | `screens/help.html` -> `/help` | `/help` | `HelpPage` | none | `partial` | Static help exists; verify content against legacy rules. |
| `ai-assistant` | `screens/ai-assistant.html` -> `/ai/assistant` | `/ai/assistant` | `AiAssistantPage` | `ai.chatStream`, `ai.chat`, rich text renderer | `partial` | Chat, markdown/LaTeX, copy, and stream fallback exist; legacy global modal, conversation history, and feedback still need parity. |
| `ai-results` | `screens/ai-results.html` -> `/ai/results` | `/ai/results` | `AiResultsPage` | `ai.requestFilter` | `partial` | React displays raw JSON; legacy result presentation and state handling need parity. |
| `admin-login` | `screens/admin-login.html` -> `/admin/login` | `/admin/login` | `LoginPage admin` | `adminAuth.login`, `adminAuth.me` | `partial` | Admin auth works through shared page; verify role-specific error and redirect parity. |
| `admin-dashboard` | `screens/admin-dashboard.html` -> `/admin/dashboard` | `/admin/dashboard` | `AdminDashboardPage` | `admin.dashboard` | `partial` | Metrics exist; legacy dashboard cards and operational links need parity. |
| `admin-users` | `screens/admin-users.html` -> `/admin/users` | `/admin/users` | `AdminGenericPage` | `admin.users`, legacy also uses `admin.updateUserStatus` | `partial` | Generic table only; status update, filters, detail, and actions from legacy are missing. |
| `admin-transactions` | `screens/admin-transactions.html` -> `/admin/transactions` | `/admin/transactions` | `AdminGenericPage` | `admin.transactions` | `partial` | Generic table only; summary, filters, pager, inspector from legacy are missing. |
| `admin-disputes` | `screens/admin-disputes.html` -> `/admin/disputes` | `/admin/disputes` | `AdminGenericPage` | `admin.disputes` | `partial` | Generic table only; dispute list actions and state handling are missing. |
| `admin-dispute-final` | `screens/admin-dispute-final.html` -> `/admin/disputes/final` | `/admin/disputes/final` | `AdminGenericPage` | React: `admin.disputes`; legacy: `admin.dispute`, `admin.finalizeDispute` | `partial` | Final adjudication detail and finalize action are legacy-only. |
| `admin-stats` | `screens/admin-stats.html` -> `/admin/stats` | `/admin/stats` | `AdminGenericPage` | `admin.stats` | `partial` | Generic JSON/table; charts and trend tables from legacy are missing. |
| `admin-ai-logs` | `screens/admin-ai-logs.html` -> `/admin/ai/logs` | `/admin/ai/logs` | `AdminGenericPage` | `admin.aiCallLogs` | `partial` | Generic table only; filters, retry/error flows, and detail view need parity. |
| `admin-ai-conversations` | `screens/admin-ai-conversations.html` -> `/admin/ai/conversations` | `/admin/ai/conversations` | `AdminGenericPage` | `admin.aiConversations`; legacy also uses `admin.aiConversation` | `partial` | Conversation detail is not implemented in React. |
| `admin-ai-feedback` | `screens/admin-ai-feedback.html` -> `/admin/ai/feedback` | `/admin/ai/feedback` | `AdminGenericPage` | `admin.aiFeedback`; legacy also uses `resolveAiFeedback`, `batchResolveAiFeedback`, `aiFeedbackReport` | `partial` | Feedback resolution/report flows are legacy-only. |
| `admin-ai-errors` | `screens/admin-ai-errors.html` -> `/admin/ai/errors` | `/admin/ai/errors` | `AdminGenericPage` | `admin.aiErrors`; legacy also uses `retryAiErrors`, `createAiIncident` | `partial` | Retry and incident creation flows are legacy-only. |
| `admin-ai-config` | `screens/admin-ai-config.html` -> `/admin/ai/config` | `/admin/ai/config` | `AdminGenericPage` | `admin.aiConfig`; legacy also uses `admin.updateAiConfig` | `partial` | Config update form is legacy-only. |
| `admin-categories` | `screens/admin-categories.html` -> `/admin/categories` | `/admin/categories` | `AdminGenericPage` | `admin.categories`; legacy also uses category/tag create/update/delete | `partial` | CRUD actions are legacy-only. |
| `admin-sensitive-words` | `screens/admin-sensitive-words.html` -> `/admin/sensitive-words` | `/admin/sensitive-words` | `AdminGenericPage` | `admin.sensitiveWords`; legacy also uses create/import/update/delete | `partial` | Moderation dictionary actions are legacy-only. |
| `admin-risk-content` | `screens/admin-risk-content.html` -> `/admin/risk-content` | `/admin/risk-content` | `AdminGenericPage` | `admin.riskContent`; legacy also uses resolve/batch review | `partial` | Risk detail and resolution actions are legacy-only. |
| `admin-audit-log` | `screens/admin-audit-log.html` -> `/admin/audit-log` | `/admin/audit-log` | `AdminGenericPage` | `admin.auditLogs` | `partial` | Generic table only; filters/pager from legacy are missing. |
| `admin-system` | `screens/admin-system.html` -> `/admin/system` | `/admin/system` | `AdminSystemPage` | `admin.system`, `admin.updateSystem`, `admin.backups`, `admin.createBackup`, `admin.restoreBackup`, `admin.deleteBackup`, `admin.auditLogs` | `partial` | React has system/backup basics, but uses reload and `window.prompt`; legacy message cleanup and richer backup flows need parity. |

## Legacy URL Redirect Coverage

`frontend/src/routes.mjs` currently builds redirects for:

- `/index.html` and `/screens/index.html` -> `/`
- `/${route.source}` -> `routePath(route)`
- `/screens/${basename(route.source)}` -> `routePath(route)`
- `/${basename(route.source)}` -> `routePath(route)`

These rules are sufficient as a source list for the final SPA redirect table, but the final runtime must redirect legacy HTML URLs instead of rendering legacy HTML.

## Prototype Shell Capability Matrix

| Business domain | Representative legacy functions | React target | Key API dependencies observed in legacy | Parity status |
|---|---|---|---|---|
| Auth and registration | `bindUserLoginForm`, `bindEmbeddedRegisterForm`, `bindRegisterPageForm`, `bindRegisterSkillTags`, `bindAdminLoginForm` | `LoginPage`, `RegisterPage` | `auth.*`, `adminAuth.*`, `verification.sendEmail` | `partial` |
| Route hydration | `hydrateCurrentRoute`, route-specific `hydrate*Route` functions | `App`, `RouteFrame`, route pages | session and route-specific APIs | `partial` |
| Feed and task market | `hydrateFeedRoute`, `renderFeedCategories`, `renderFeedList`, `bindFeedAcceptButtons`, `hydrateTasksRoute`, `renderTaskList`, pagers/state renderers | `FeedPage`, `TasksPage` | `feed.list`, `requests.list`, `requests.apply`, `categories.list`, `notifications.list` | `partial` |
| Publish and content creation | `hydratePostRoute`, `renderPublishCategories`, `renderPublishTags`, `renderCommunityPostDraftPanel`, `renderPublishDraftPanel`, image slot helpers, success panels | `PostPage` | `categories.list`, `tags.list`, `content.check`, `ai.requestDraft`, `requests.create`, `communityPosts.create`, `files.upload` | `partial` |
| Request/community detail | `hydratePostDetailRoute`, `hydrateCommunityPostDetailRoute`, comment composers, like/collect/comment like binders | `RequestDetailPage`; missing community post detail route | `requests.detail`, `requests.applications`, `approveApplication`, `rejectApplication`, `communityPosts.detail`, `like`, `collect`, comments | `partial` |
| Orders and review | `hydrateOrdersRoute`, `renderOrdersList`, `renderOrderPanels`, `hydrateOrderDetailRoute`, `hydrateReviewRoute`, review state/success renderers | `OrdersPage`, `OrderDetailPage`, `ReviewPage` | `orders.list`, `orders.detail`, `orders.confirm`, `orders.reviews`, `orders.review`, `ai.orderSummary` | `partial` |
| Disputes and jury | `hydrateDisputeCreateRoute`, `hydrateDisputeDetailRoute`, `hydrateJuryHallRoute`, `hydrateJuryVotingRoute`, jury/dispute renderers | `DisputeCreatePage`, `DisputeDetailPage`, `JuryVotingPage`; missing `JuryHallPage` | `orders.detail`, `orders.dispute`, `disputes.detail`, `disputes.evidence`, `jury.disputes`, `jury.dispute`, `jury.vote`, `ai.disputeSummary` | `partial` / `route-gap` |
| Wallet | `hydrateWalletRoute`, `renderWalletTransactions`, `renderWalletPager`, `hydrateWalletFreezeRoute`, `renderWalletFreezes` | `WalletPage`, `WalletFreezePage` | `wallet.me`, `wallet.transactions`, `wallet.freezes` | `partial` |
| Messages and notifications | `hydrateMessagesRoute`, `renderMessageConversations`, `renderMessageThread`, `hydrateNotificationsRoute`, `renderNotifications`, `bindNotificationCard` | `MessagesPage`, `NotificationsPage` | `messages.list`, `messages.thread`, `messages.readThread`, `messages.send`, `notifications.list`, `notifications.read`, `notifications.readAll`, `settings.*` | `partial` |
| Profile, public user, credit, settings | `hydrateProfileRoute`, `renderProfile*`, `hydratePublicProfileRoute`, `hydrateCreditRoute`, `hydrateSettingsRoute`, session/security helpers | `ProfilePage`, `UserPublicPage`, `CreditPage`, `SettingsPage` | `users.me`, `users.public`, `users.credit`, `users.contact`, `users.follow`, `settings.*`, `auth.changePassword`, `auth.sessions`, `auth.revokeSession` | `partial` |
| AI user features | `hydrateAiAssistantRoute`, `bindAiRuntimeActions`, `hydrateAiResultsRoute`, `renderAiResults` | `AiAssistantPage`, `AiResultsPage` | `ai.chat`, `ai.chatStream`, `ai.conversations`, `ai.feedback`, `ai.requestFilter`, `ai.requestDraft` | `partial` |
| Admin dashboard and operations | `hydrateAdminDashboardRoute`, `renderAdminDashboard`, admin renderers for users/transactions/disputes/stats/categories/sensitive words/risk/audit/system | `AdminDashboardPage`, `AdminSystemPage`, `AdminGenericPage` | `admin.dashboard`, `admin.users`, `admin.transactions`, `admin.disputes`, `admin.stats`, CRUD and moderation APIs | `partial` |
| Admin AI governance | `hydrateAdminAi*Route`, `renderAdminAiLogs`, `renderAdminAiConversations`, `renderAdminAiFeedback`, `renderAdminAiErrors`, `renderAdminAiConfig` | `AdminGenericPage` | `admin.aiCallLogs`, `aiConversations`, `aiFeedback`, `resolveAiFeedback`, `retryAiErrors`, `createAiIncident`, `aiConfig`, `updateAiConfig` | `partial` |

## API Client Coverage Notes

React `frontend/src/spa/api.ts` already includes client groups for auth, verification, requests, request comments, categories, tags, orders, disputes, jury, wallet, notifications, messages, community posts, collections, users, settings, files, AI, and admin.

Known gaps or mismatches to verify during migration:

- `api.jury.disputes` is used by legacy jury hall, but React API client only exposes `jury.dispute` and `jury.vote`.
- Legacy uses `messages.thread` and `messages.readThread`; React API client only exposes `messages.list`, `messages.send`, and `messages.read`.
- Legacy uses application review APIs such as `requests.applications`, `approveApplication`, and `rejectApplication`; React API client currently lacks these methods.
- Legacy account settings use `auth.changePassword`, `auth.sessions`, `auth.revokeSession`, and `auth.revokeOtherSessions`; React API client currently lacks these methods.
- Admin client has many mutation APIs, but most admin React routes still use `AdminGenericPage` and do not expose those actions.

