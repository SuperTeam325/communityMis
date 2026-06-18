# 阶段 8 SPA 测试体系迁移测试说明

## 本阶段变更概览

阶段 8 的目标是把 CI 和本地验收从“旧原型 HTML / prototype shell 是否存在”的检查，迁移为“真实 React SPA 路由、组件行为、生产构建和浏览器运行时”的检查。本阶段不新增业务功能，也不恢复旧原型源码，重点是让测试体系完全围绕当前 SPA 源码和生产运行方式验收。

本阶段完成的关键变化：

- 新增 `scripts/spa-validation-helpers.mjs`，集中维护 SPA 路由、构建产物、前端服务 fallback、legacy redirect 和旧原型依赖删除检查。
- `scripts/validate-stage-08.mjs` 改为阶段 8 专用验收脚本，明确验证“测试体系已迁移为 SPA 语义”。
- `scripts/validate-stage-09.mjs` 到 `scripts/validate-stage-23.mjs` 已移除对 `renderPrototypeHtml()`、`prototype-shell.mjs`、旧 `frontend/src/routes.mjs`、`frontend/public/ui/screens` 等原型运行时依赖。
- 各阶段脚本保留原有业务主题，但前端断言改为检查 SPA route metadata、`App.tsx` 路由分发、React 页面组件、API client 和后端 API 闭环。
- `scripts/test-visual.mjs` 改为扫描真实 SPA 页面，覆盖 `/feed`、`/post`、`/messages`、`/wallet`、`/admin/dashboard`、`/admin/system` 等代表性路由。
- `scripts/test-a11y.mjs` 改为在真实 SPA 页面中执行 axe 扫描，并分别建立游客、普通用户和管理员上下文。
- `scripts/test-performance.mjs` 增加“生产构建只有一个 HTML 入口”的断言，确保仍是单入口 SPA。
- `tests/e2e/spa-runtime-navigation.spec.ts` 新增 SPA 浏览器运行时覆盖，包括动态路由刷新、React Router 内部导航、受保护路由重定向和局部数据刷新。
- `tests/e2e/production-runtime.spec.ts` 扩展 legacy redirect 和动态路由刷新断言。
- `tests/component/spa-data-flow.test.tsx` 补强 `useQueryParams`、`useAsync.reload`、`useMutationTracker` 以及局部刷新场景。
- `tests/unit/frontend-runtime.test.ts` 中旧“prototype shell hydration”文案已改为 SPA runtime 语义。
- 验收过程中修复了一个后端权限问题：非纠纷参与方不应访问纠纷详情，`backend/src/requests/routes.mjs` 已收紧 `canViewDispute` 判断。
- 浏览器验收过程中补充了 SPA 体验修复：移动端顶部导航不再横向溢出，active chip / badge 对比度满足 a11y 要求，AI 后台筛选 `select` 增加可访问名称。

## 涉及文件与产物

测试人员重点关注以下脚本和测试：

- `scripts/spa-validation-helpers.mjs`
- `scripts/validate-stage-08.mjs`
- `scripts/validate-stage-09.mjs` 到 `scripts/validate-stage-23.mjs`
- `scripts/validate-frontend-build.mjs`
- `scripts/test-visual.mjs`
- `scripts/test-a11y.mjs`
- `scripts/test-performance.mjs`
- `tests/e2e/production-runtime.spec.ts`
- `tests/e2e/spa-runtime-navigation.spec.ts`
- `tests/component/spa-data-flow.test.tsx`
- `tests/unit/frontend-runtime.test.ts`

测试人员重点关注以下 SPA 源码：

- `frontend/src/spa/route-data.mjs`
- `frontend/src/spa/routes.ts`
- `frontend/src/spa/App.tsx`
- `frontend/src/spa/pages/*.tsx`
- `frontend/src/spa/styles.css`
- `frontend/server.mjs`

构建后重点关注以下产物：

- `frontend/dist/index.html`
- `frontend/dist/routes.json`
- `frontend/dist/manifest.json`
- `frontend/dist/assets/*`

构建后不应再出现：

- `frontend/dist/pages/*.html`
- `frontend/dist/assets/app/prototype-shell.mjs`
- `frontend/dist/ui`
- `frontend/dist/styles`
- 任何需要 `frontend/public/ui/screens/*.html` 或 `UISource/screens/*.html` 才能通过当前 CI 的逻辑

## 自动化验证

在项目根目录执行：

```powershell
npm run typecheck
npm run test:unit
npm run test:component
npm run build
npm run test:frontend-build
npm run test:stage08
npm test
npm run test:e2e
npm run test:visual
npm run test:a11y
npm run test:performance
```

预期结果：

- 所有命令退出码为 0。
- `npm run test:stage08` 应明确验证测试体系已迁移到 SPA 语义。
- `npm test` 应完整执行 `validate-stage-01` 到 `validate-stage-23`。
- `npm run test:e2e` 应通过 SPA fallback、动态路由刷新、内部导航、认证重定向、局部数据刷新和生产运行时核心业务流。
- `npm run test:visual` 应在移动端、平板、桌面和宽屏视口下通过，不能出现运行时错误或水平溢出。
- `npm run test:a11y` 应在真实 SPA 页面中完成 axe 扫描，不能出现 serious 或 critical 级别违规。
- `npm run test:performance` 应确认生产构建只有一个 HTML 入口，并满足 SPA bundle 预算。
- `npm run test:frontend-build` 应确认生产 HTML、manifest、routes、CSP、fallback、legacy redirect 和静态资源边界。

说明：如果 `npm run build` 或 `npm test` 只出现 Vite chunk 体积警告，但命令退出码为 0，不视为阶段 8 验收失败。阶段 23 中如出现 SMTP dev warning，且命令退出码为 0，也不视为阶段 8 验收失败。

## 旧原型依赖扫描

执行：

```powershell
rg "renderPrototypeHtml|prototype-shell\.mjs|frontend/src/prototypeRenderer|frontend/src/routes\.mjs|UISource/screens|frontend/public/ui/screens" scripts tests frontend/src
```

预期结果：

- 不应命中仍作为当前测试依赖或页面渲染依赖的代码。
- 允许命中明确的负向检查文案，例如 `spa-validation-helpers.mjs`、`validate-stage-07.mjs`、`validate-stage-08.mjs`、`validate-frontend-build.mjs` 中用于断言旧原型不存在的字符串。

判定方式：

- 如果某个命中点是在 `import`、`require`、运行时渲染、页面读取或测试数据加载中使用旧原型路径，应判为失败。
- 如果某个命中点只是 `record(!html.includes("prototype-shell.mjs"), ...)` 这类负向断言，可判为通过。

## 手工验证环境

先构建生产产物：

```powershell
npm run build
```

启动后端和前端。可使用项目脚本：

```powershell
npm run dev
```

也可以分别启动生产前端服务：

```powershell
$env:API_BASE_URL="http://127.0.0.1:3001"
node frontend/server.mjs
```

默认访问地址：

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:3001`

建议测试账号：

- 普通用户 A：`user_a / user123456`
- 普通用户 B：`user_b / user123456`
- 管理员：`admin_main / admin123456`

## 手工验收清单

### 1. 生产构建结构

执行 `npm run build` 后检查 `frontend/dist`。

预期结果：

- 只存在一个 HTML 入口：`index.html`。
- `index.html` 中存在 React root。
- `manifest.json` 中 `type` 为 `vite-react-spa`，`frontendMode` 为 `spa`。
- `routes.json` 包含当前 SPA 路由清单。
- `routes.json` 中不应出现旧原型 `source` 字段。
- JS/CSS 资源位于 `assets/` 下，文件名带 hash。
- 不存在 `pages/*.html`、`assets/app/prototype-shell.mjs`、`ui/screens` 或 prototype `styles` 复制物。

### 2. SPA history fallback

直接刷新以下地址：

- `/feed`
- `/posts/2001`
- `/orders/3001`
- `/disputes/8001`
- `/jury/disputes/8001`
- `/admin/dashboard`

预期结果：

- 前端服务返回 React `index.html`。
- 页面由 React SPA 接管渲染。
- 动态详情页刷新后仍能显示对应页面内容或正确的认证重定向。
- 浏览器文档中不应加载 `prototype-shell.mjs`。

### 3. API 与静态资源边界

访问或请求：

- `/api/health`
- `/api/not-exist`
- `/assets/not-exist.js`
- `/ui/not-exist.js`

预期结果：

- `/api/*` 不应被前端 history fallback 吞掉。
- 缺失静态资源应返回 404，而不是返回 SPA `index.html`。
- 前端服务只负责 SPA 页面和静态资源，API 仍由后端处理。

### 4. Legacy URL 重定向

访问：

- `/screens/feed.html`
- `/community-posts/2001`
- `/jury/voting?disputeId=8001`

预期结果：

- `/screens/feed.html` 重定向到 `/feed`。
- `/community-posts/2001` 重定向到 `/posts/2001`。
- `/jury/voting?disputeId=8001` 重定向到 `/jury/disputes/8001`。
- 重定向后页面由 React SPA 渲染，不应回到旧 HTML 页面。

### 5. 认证和权限路由

在未登录状态直接访问：

- `/orders/3001`
- `/admin/dashboard`

预期结果：

- 普通受保护路由进入 `/login?redirect=...`。
- 管理后台路由进入 `/admin/login?redirect=...`。
- 重定向发生在 SPA 内部，不应出现整页跳到旧原型地址。

使用普通用户登录后访问：

- `/admin/dashboard`

预期结果：

- 普通用户不能进入管理后台，应被拒绝并跳转到管理员登录页。

### 6. React Router 内部导航

登录普通用户后，从 `/feed` 点击任务卡片或导航到详情页。

预期结果：

- URL 变化到 SPA 路由，例如 `/posts/2001`。
- 页面不发生整页刷新。
- 浏览器 Network 面板中不应出现加载旧 `pages/*.html` 或 `prototype-shell.mjs`。

### 7. 局部数据刷新

验证至少两个局部 mutation 场景：

- 在 `/messages` 发送消息。
- 在 `/notifications` 标记通知已读。
- 在 `/orders/:id` 确认订单。
- 在后台页面调整状态或执行管理动作。

预期结果：

- mutation 成功后，只刷新受影响的列表、详情或统计数据。
- 页面不调用 `window.location.reload()`。
- 页面不依赖 `window.location.href` 跳转旧 URL。

### 8. 视觉与移动端布局

在移动端宽度约 390px 下访问：

- `/feed`
- `/post`
- `/messages`
- `/wallet`
- `/admin/dashboard`
- `/admin/system`

预期结果：

- 页面无横向滚动条。
- 顶部导航、底部导航、筛选 chip、表单和卡片不应撑破视口。
- 用户名较长时，移动端顶部导航仍应保持紧凑。

### 9. 无障碍检查重点

重点检查：

- 登录页输入框有可访问名称。
- 管理后台 AI 日志筛选 `select` 有可访问名称。
- active 导航、chip、badge 文字和背景对比度满足 WCAG AA。
- 运行 `npm run test:a11y` 时，失败信息应包含具体 route 和 violation id。

### 10. 纠纷详情权限回归

用纠纷参与方访问：

- `/disputes/8001`

预期结果：

- 参与方可以查看纠纷详情。

用非参与普通用户访问同一纠纷详情 API 或页面：

- `/api/disputes/8001`
- `/disputes/8001`

预期结果：

- 非参与方不能查看纠纷详情。
- 陪审员应通过 `/jury/disputes/:id` 查看脱敏投票材料，而不是通过参与方纠纷详情接口越权访问。

## 失败判定标准

出现以下情况应判为阶段 8 验收失败：

- 任一自动化命令退出码非 0。
- `npm test` 未完整执行阶段 01 到阶段 23。
- 当前测试脚本仍导入或调用 `renderPrototypeHtml()`、`prototypeRenderer.mjs` 或 `prototype-shell.mjs`。
- 当前验收仍读取 `frontend/public/ui/screens/*.html` 或 `UISource/screens/*.html` 作为通过条件。
- 生产构建出现多个 HTML 入口或重新生成 `pages/*.html`。
- SPA 业务路由刷新后返回 404 或旧 prototype shell。
- `/api/*` 或缺失静态资源被错误 fallback 到 `index.html`。
- legacy URL 不重定向到 SPA 路由。
- e2e 不能覆盖动态路由刷新、内部导航、认证重定向和局部刷新。
- visual 检查发现移动端横向溢出。
- a11y 检查出现 serious 或 critical 违规。

## 测试结论记录建议

测试人员提交阶段 8 验收结果时，建议记录：

- 当前 commit 或构建版本。
- 执行的命令清单和退出码。
- `npm test` 是否覆盖阶段 01 到阶段 23。
- `test:e2e`、`test:visual`、`test:a11y`、`test:performance` 的结果。
- 旧原型依赖扫描结果，并说明命中是否仅为负向检查。
- 若出现 Vite chunk warning 或 SMTP dev warning，记录为非阻塞警告，并确认命令退出码为 0。
