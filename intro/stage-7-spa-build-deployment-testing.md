# 阶段 7 SPA 构建部署与旧体系删除测试说明

## 本阶段变更概览

阶段 7 的目标是把生产前端从“React SPA + 原型 HTML 构建兼容”收敛为真正的 Vite React SPA 交付形态。前 6 个阶段已经完成用户端、辅助业务域、AI 治理和管理后台的 SPA 迁移，本阶段重点处理构建、部署、生产服务和旧原型体系删除。

本阶段完成的关键变化：

- 生产构建现在只执行 Vite React SPA build，不再生成 `frontend/dist/pages/*.html`。
- 构建产物保留 `index.html`、`config.json`、`config.template.json`、`routes.json`、`manifest.json` 和 Vite hash 资源。
- `manifest.json` 明确标记 `type: "vite-react-spa"` 和 `frontendMode: "spa"`。
- 删除旧原型运行时和原型模块入口，包括 `prototypeRenderer.mjs`、`prototype-shell.mjs`、`frontend/src/app/main.mjs`、`frontend/src/app/modules/*`、旧 `frontend/src/routes.mjs` 等。
- 新增 SPA 路由元信息和服务端运行时共享模块：`frontend/src/spa/route-data.mjs`、`frontend/src/spa/server-runtime.mjs`。
- `frontend/server.mjs` 现在只负责静态资源、运行时配置、健康检查、路由清单、旧 URL 重定向和 SPA history fallback。
- `/api/*` 不再进入 SPA fallback，必须由后端服务处理。
- 旧原型 URL 会重定向到 SPA 路由，例如 `/screens/feed.html` 到 `/feed`、`/community-posts/:id` 到 `/posts/:id`、`/jury/voting?disputeId=...` 到 `/jury/disputes/:id`。
- `vite.config.ts` 禁用 `publicDir`，避免把 `frontend/public/ui` 等旧原型目录复制进生产构建。
- SPA 样式已从旧 public CSS import 迁移到 `frontend/src/spa/styles.css`，生产包不再依赖原型样式树。
- `scripts/validate-stage-07.mjs` 和 `scripts/validate-frontend-build.mjs` 已改为检查真正 SPA 构建产物、服务 fallback、manifest、routes 和旧体系删除。
- `tests/e2e/production-runtime.spec.ts` 已迁移到当前 SPA 页面结构，覆盖真实生产服务下的登录、发布、消息、通知和核心 API 链路。
- 根目录 `README.md` 已补充生产 SPA 构建、路由和阶段 7 验证说明。
- `deploy/nginx/community-mis.conf` 调整为 API 代理给后端，其余请求交给前端服务，由前端服务承担 SPA fallback 和 legacy redirect。

## 涉及文件与产物

测试人员重点关注以下源码和配置：

- `scripts/build-frontend.mjs`
- `frontend/server.mjs`
- `frontend/src/spa/route-data.mjs`
- `frontend/src/spa/server-runtime.mjs`
- `frontend/src/spa/styles.css`
- `scripts/validate-stage-07.mjs`
- `scripts/validate-frontend-build.mjs`
- `scripts/test-performance.mjs`
- `tests/e2e/production-runtime.spec.ts`
- `vite.config.ts`
- `deploy/nginx/community-mis.conf`
- `README.md`

构建后重点关注以下产物：

- `frontend/dist/index.html`
- `frontend/dist/config.json`
- `frontend/dist/config.template.json`
- `frontend/dist/routes.json`
- `frontend/dist/manifest.json`
- `frontend/dist/assets/*`

构建后不应再出现：

- `frontend/dist/pages/*.html`
- `frontend/dist/assets/app/prototype-shell.mjs`
- `frontend/dist/ui`
- `frontend/dist/styles`
- 任何需要 `UISource/screens/*.html` 才能渲染生产页面的逻辑

## 自动化验证

在项目根目录执行：

```powershell
npm run typecheck
npm run build
npm run test:stage07
npm run test:frontend-build
npm run test:performance
npm run test:unit
npm run test:e2e
```

预期结果：

- 所有命令退出码为 0。
- `npm run build` 只生成 Vite React SPA 产物。
- `test:stage07` 应检查旧原型源码删除、构建产物无原型页面、manifest 标记 SPA、服务端 fallback 和 legacy redirect。
- `test:frontend-build` 应检查生产构建、CSP、静态资源缓存、SPA fallback、`/api/*` 排除和缺失静态资源 404。
- `test:performance` 应按 SPA 产物体积预算检查 HTML、CSS gzip 和 JS gzip。
- `test:e2e` 应继续通过阶段 3 到阶段 6 业务流以及生产运行时回归。

说明：构建过程中如果只出现 Vite chunk 体积警告，但命令退出码为 0，则不视为阶段 7 验收失败。

## 手工验证环境

先构建生产产物：

```powershell
npm run build
```

启动生产前端服务时必须提供后端 API 地址，例如：

```powershell
$env:API_BASE_URL="http://127.0.0.1:3001"
node frontend/server.mjs
```

如果使用项目开发脚本联调，也应先确认 `frontend/dist` 已是最新构建结果。

## 手工验收清单

### 1. 构建产物结构

执行 `npm run build` 后检查 `frontend/dist`。

预期结果：

- `index.html` 存在且包含 React root。
- `config.json`、`config.template.json`、`routes.json`、`manifest.json` 存在。
- JS/CSS 资源位于 `assets/` 下，文件名带 hash。
- `manifest.json` 中 `type` 为 `vite-react-spa`，`frontendMode` 为 `spa`。
- `routes.json` 包含 SPA 路由清单，不暴露旧原型 `source` 字段。
- 不存在 `pages` 目录，或该目录为空。
- 不存在 `assets/app/prototype-shell.mjs`。
- 不存在复制出来的 `ui/screens` 或 prototype `styles` 树。

### 2. 生产服务健康检查

访问：

- `/frontend-health`
- `/config.json`
- `/routes.json`
- `/manifest.json`

预期结果：

- `/frontend-health` 返回 `frontendMode: "spa"`。
- `/config.json` 包含运行时 API 地址、环境和构建版本。
- `/config.json` 应使用 no-cache，避免部署后继续读取旧配置。
- `/routes.json` 返回 SPA 路由元信息。
- `/manifest.json` 标记为 React SPA，不包含 `prototypeAssets`。

### 3. SPA history fallback

直接刷新或直接打开以下路径：

- `/`
- `/login`
- `/feed`
- `/orders/demo`
- `/jury`
- `/jury/disputes/demo`
- `/admin/dashboard`

预期结果：

- 这些路径都应返回同一个 React `index.html`。
- 页面不应加载 `prototype-shell.mjs` 或 `/assets/app/` 旧运行时。
- React 启动后 HTML 上的 `data-route-id` 应匹配当前 SPA 路由。
- 需要登录的页面应进入 SPA 登录重定向，不应出现服务端 404。

### 4. `/api/*` 排除 fallback

访问不存在的 API 路径，例如：

- `/api/not-a-real-route`

预期结果：

- 前端服务不应返回 React `index.html`。
- 该路径应由后端或代理处理；在无后端匹配时应是 API 语义的错误，不是 SPA fallback 页面。

### 5. 缺失静态资源

访问不存在的静态资源，例如：

- `/assets/not-exist.js`
- `/favicon-not-exist.ico`

预期结果：

- 返回 404。
- 不应 fallback 到 `index.html`。
- 响应内容不应包含 React root。

### 6. 旧 URL 重定向

访问旧原型或历史 URL：

- `/screens/feed.html`
- `/community-posts/42`
- `/jury/voting?disputeId=99`

预期结果：

- `/screens/feed.html` 重定向到 `/feed`。
- `/community-posts/42` 重定向到 `/posts/42`。
- `/jury/voting?disputeId=99` 重定向到 `/jury/disputes/99`。
- 重定向后的页面由 React SPA 渲染。

### 7. 生产运行时核心链路

使用普通用户登录：

- 用户：`user_a` / `user123456`

验证：

- 访问 `/profile` 未登录时会跳到 `/login?redirect=%2Fprofile`。
- 登录成功后进入 `/feed`。
- 访问 `/post`，选择类别，填写标题、描述、预计耗时、时间币和地点后可发布需求。
- 发布成功后在 `/feed` 可以看到新需求。
- 访问 `/messages` 可以看到会话列表，例如“小王维修”和系统通知会话。
- 访问 `/notifications` 可以看到通知卡片，例如“需求已被接单”。

使用管理员登录：

- 管理员：`admin_main` / `admin123456`

验证：

- 访问 `/admin/dashboard` 未登录或普通用户登录时会跳到 `/admin/login?redirect=%2Fadmin%2Fdashboard`。
- 管理员登录后进入 `/admin/dashboard`。
- 页面 HTML 路由标识应为 `data-route-id="admin-dashboard"`。

### 8. 部署代理检查

如果通过 Nginx 或部署环境验证，重点检查：

- `/api/` 请求代理到后端。
- 其他路径交给前端服务。
- SPA fallback 由前端服务处理。
- legacy redirect 不应被 Nginx 提前改写成错误路径。
- 静态 hash 资源应可长期缓存，`config.json` 应保持 no-cache。

## 代码级回归检查

测试人员可以辅助确认以下约束仍成立：

- `scripts/build-frontend.mjs` 不应再引用 `prototypeRenderer`、`prototype-shell`、`emitPrototypePages`、`emitPrototypeRuntimeAssets`、`UISource`、`frontend/public/ui` 或 `/assets/app/`。
- `frontend/server.mjs` 不应再读取 `UISource/screens/*.html`。
- 生产服务不应再存在 `FRONTEND_MODE` 的原型/SPA 双模式分支。
- SPA 路由元信息不应再包含旧原型 `source` 字段。
- `frontend/src/spa/styles.css` 不应 import 旧 public UI CSS。
- 生产构建不应复制 `frontend/public/ui`。
- 用户端内部业务链接应使用 SPA 路由，例如帖子详情使用 `/posts/:id`，不应继续跳 `/community-posts/:id`。
- 生产 e2e 不应依赖旧原型 DOM，例如 `#tab-chat`、`.conv-item`、`#notif-list` 这类旧选择器。

## 缺陷记录建议

提交缺陷时建议记录：

- 验证的构建命令和构建时间。
- `frontend/dist/manifest.json`、`routes.json` 的关键字段。
- 访问的原始 URL、最终 URL、HTTP 状态码和是否发生重定向。
- 失败路径是否属于 SPA fallback、静态资源、API 或 legacy redirect。
- Network 面板中是否加载了 `prototype-shell.mjs`、`/assets/app/`、`/pages/*.html` 或旧 public UI 资源。
- 如果是部署环境问题，记录 Nginx/网关路径、后端 API 地址和前端服务地址。
- 如果是登录或业务流问题，记录账号、当前路由、HTML `data-route-id` 和对应 API 响应。
