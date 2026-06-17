# 阶段 1 SPA 运行时改造测试说明

## 本阶段变更概览

阶段 1 的目标是引入可切换的 SPA 运行时骨架，同时不破坏现有原型页面运行方式。默认仍使用 prototype 模式；只有显式设置 `FRONTEND_MODE=spa` 时，前端服务才会把业务路由交给 React SPA 入口 `frontend/dist/index.html`。

本阶段完成的关键变化：

- 新增 `FRONTEND_MODE=spa` 前端运行模式。
- SPA 模式下，`/`、`/feed`、`/tasks`、`/orders/:id`、`/jury`、`/jury/disputes/:id`、`/admin/dashboard` 等业务路径返回 React SPA 入口。
- `/api/*` 不由前端兜底，仍保持 API 边界；直接访问前端服务的 `/api/*` 应返回 404。
- legacy HTML 路径继续重定向到对应业务路径，例如 `/screens/feed.html` 重定向到 `/feed`。
- 路由元数据增加 `auth`、`nav` 字段，用于后续权限和导航迁移。
- 新增 `/jury` 陪审大厅路由和 `/jury/disputes/:id` 陪审投票路由。
- SPA Shell 的主导航、底部导航和后台侧栏改为 React Router 的 `Link` / `NavLink`，降低主导航整页刷新。
- 构建和验证脚本已覆盖 prototype 默认模式与 SPA 显式模式。

## 自动化验证

在项目根目录执行：

```powershell
npm run typecheck
npm run build
npm run test:stage01
npm run test:frontend-build
```

预期结果：

- 所有命令退出码为 0。
- `test:stage01` 应确认 SPA 路由覆盖、legacy redirect、`/api/*` 边界、静态资源 404、SPA Shell 导航实现。
- `test:frontend-build` 应同时验证默认 prototype 模式和 `FRONTEND_MODE=spa` 模式。

## 手工验证环境

先构建前端产物：

```powershell
npm run build
```

启动 SPA 模式本地服务：

```powershell
$env:FRONTEND_MODE="spa"
$env:API_BASE_URL="http://127.0.0.1:3001"
npm run dev
```

默认访问地址：

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:3001`

测试完成后，可以在当前 PowerShell 会话中清理环境变量：

```powershell
Remove-Item Env:FRONTEND_MODE
Remove-Item Env:API_BASE_URL
```

## 手工验收清单

### 1. SPA 路由入口

直接在浏览器访问以下地址，预期页面均能加载 React SPA，不应出现 404 或 prototype 静态壳：

- `http://127.0.0.1:5173/`
- `http://127.0.0.1:5173/feed`
- `http://127.0.0.1:5173/tasks`
- `http://127.0.0.1:5173/orders/demo`
- `http://127.0.0.1:5173/disputes/demo`
- `http://127.0.0.1:5173/jury`
- `http://127.0.0.1:5173/jury/disputes/demo`
- `http://127.0.0.1:5173/admin/dashboard`

可打开浏览器开发者工具确认文档中存在 `id="root"` 的 SPA 容器。

### 2. Legacy HTML 重定向

访问：

```text
http://127.0.0.1:5173/screens/feed.html
```

预期结果：

- 浏览器跳转到 `/feed`。
- 页面正常加载 SPA。

### 3. API 边界

直接访问前端服务上的 API 路径：

```text
http://127.0.0.1:5173/api/health
```

预期结果：

- 返回 404。
- 该请求不应被 SPA index.html 兜底。

后端 API 仍应通过后端端口访问：

```text
http://127.0.0.1:3001/api/health
```

### 4. 主导航不整页刷新

登录或进入可访问页面后，检查以下导航：

- 顶部或侧边主导航：信息流、任务、订单、钱包、消息等入口。
- 后台侧栏：仪表盘、用户、服务、交易等入口。
- 首页入口：进入社区、进入管理后台。

预期结果：

- 点击导航时 URL 正常变化。
- Network 面板不应出现新的 `document` 类型整页请求。
- 页面内容在 SPA 内切换。

### 5. 陪审路由

访问：

```text
http://127.0.0.1:5173/jury
```

预期结果：

- 页面显示陪审相关列表或空状态。
- 页面内进入具体争议时，路径应为 `/jury/disputes/:id`。

访问：

```text
http://127.0.0.1:5173/jury/disputes/demo
```

预期结果：

- 页面进入陪审投票视图。
- 即使数据不存在，也应显示业务态错误或空态，而不是前端 404。

## 仍不属于本阶段的范围

以下问题不是阶段 1 的验收失败项，会在后续阶段继续迁移：

- 部分业务操作提交后仍可能调用 `window.location.reload()`。
- 部分深层页面动作仍可能触发整页跳转。
- 业务功能的完整生产等价、权限细节、表单流转和数据一致性仍按后续阶段推进。

## 测试结论记录建议

测试人员记录问题时建议包含：

- 当前运行模式：prototype 或 `FRONTEND_MODE=spa`。
- 访问 URL。
- 是否为直接刷新、导航点击、表单提交或浏览器回退触发。
- Network 面板中是否出现 `document` 类型请求。
- 控制台错误信息和后端 API 响应状态码。
