# 大页面切换性能分析会话归档（2026-04-18）

## 1. 会话背景
- 目标问题：Docmost 某些页面内容很多时，例如多个表格、多个图片、多行富文本，从其他页面切换到该页面时 Chrome 会卡顿一段时间，之后页面才展示出来。
- 本轮目标：
  - 判断瓶颈更偏后端接口读取还是前端 DOM/编辑器渲染。
  - 基于项目源码做分析。
  - 形成并实施第一轮优化方案。
  - 将结论和上下文沉淀到文档，便于下次会话继续推进。

## 2. 本轮分析结论

### 2.1 总结结论
- 当前更高概率的主瓶颈是 **前端编辑器初始化与重内容渲染**，不是后端 SQL 本身慢。
- 后端 SQL 存在一些风险点，但更可能放大“等待时间”，不太像“页面越大 Chrome 主线程越卡”的决定性根因。
- 第一轮最合理策略是：
  - 先建立前后端分段可观测能力。
  - 优先去掉前端切页时的重内容双重渲染。
  - 同时收敛后端重复查询与 SQL 风险点。

### 2.2 支撑判断的关键证据
- `/pages/info` 后端主查询本身相对简单：
  - 通过 `pageRepo.findById(...)` 查询 `pages` 主表。
  - 返回 `content jsonb` 和少量关联对象。
  - 没有发现复杂递归展开、大量 join、内容二次转换等高 CPU 路径。
- 页面切换后的前端链路较重：
  - 页面详情页先请求 `pages/info`，之后再请求 `spaces/info`。
  - 编辑器使用 TipTap + ProseMirror + Yjs + Hocuspocus。
  - 原实现中 `PageEditor` 会先用静态只读编辑器渲染整份内容，再切换成正式编辑器，存在明显双重渲染风险。
- 该问题与“页面内容复杂度高”高度相关：
  - 多表格、多图片、多 NodeView 块会显著增加编辑器解析、节点挂载、布局和重排开销。
  - 这一点更符合前端主线程卡顿特征，而不是后端 SQL 复杂度特征。

## 3. 后端 SQL 风险分析结论

### 3.1 已识别风险点
- `DomainMiddleware` 每请求会解析 workspace：
  - 自托管模式下调用 `workspaceRepo.findFirst()`
  - Cloud 模式下调用 `workspaceRepo.findByHostname()`
- `/pages/info` 会读取整页 `content jsonb`
  - 大页面时，返回体和序列化成本会放大。
- `/spaces/info` 在页面展示链路里是额外请求
  - 还会附带 member count 和权限计算。
- 权限计算 `getUserSpaceRoles()` 走 `spaceMembers + groupUsers union all`
  - 属于额外查询成本。
- `LOWER(slug)` / `LOWER(hostname)` 查询存在函数索引命中不稳定的潜在风险
  - 是否实际有问题需要后续用 `EXPLAIN ANALYZE` 验证。

### 3.2 当前判断
- 这些 SQL 风险点存在，但从源码层面仍不足以支持“SQL 是本次卡顿主因”的结论。
- 更像：
  - SQL 影响“等待变长”
  - 前端影响“卡顿明显”

## 4. 本轮已实施内容

### 4.1 前端已实施

#### 4.1.1 新增前端性能埋点工具
- 文件：`apps/client/src/lib/perf.ts`
- 作用：
  - 开发环境下记录 `performance.mark` / `performance.measure`
  - 汇总到 `window.__DOCMOST_PERF__`
  - 解析 `Server-Timing`
  - 输出调试日志

#### 4.1.2 页面请求链路埋点
- 文件：
  - `apps/client/src/features/page/services/page-service.ts`
  - `apps/client/src/features/space/services/space-service.ts`
  - `apps/client/src/lib/api-client.ts`
- 已埋点内容：
  - `pages.info` 请求开始/结束
  - `spaces.info` 请求开始/结束
  - 读取响应头里的 `Server-Timing`
  - 输出服务端 timing 和响应长度信息

#### 4.1.3 页面切换不再等待 `/spaces/info` 才渲染正文
- 文件：`apps/client/src/pages/page/page.tsx`
- 已调整：
  - 页面只要 `page` 数据回来，就开始渲染正文主区域。
  - `space` 查询不再阻塞正文首屏可见。
- 当前行为：
  - `editable` 能力仍由 `space` 权限决定。
  - 如果 `space` 尚未返回，则先按只读路径进入。

#### 4.1.4 编辑器去掉静态重内容双重渲染
- 文件：`apps/client/src/features/editor/page-editor.tsx`
- 原问题：
  - 先渲染整份静态只读 `EditorProvider`
  - 再切到正式编辑器
- 已调整：
  - 去掉静态整页编辑器占位
  - 改为轻量 `EditorSkeleton`
  - 正式编辑器创建后直接展示
- 已新增埋点：
  - provider 初始化
  - 本地同步完成
  - 远端同步完成
  - 协作连接完成
  - 编辑器创建完成
  - 内容可见
  - 协作 ready

#### 4.1.5 FullEditor 首屏挂载埋点
- 文件：`apps/client/src/features/editor/full-editor.tsx`
- 已补充 `FullEditor mount` 性能标记。

### 4.2 后端已实施

#### 4.2.1 新增后端性能工具
- 文件：`apps/server/src/common/helpers/perf.util.ts`
- 作用：
  - 异步/同步耗时测量
  - 返回体字节估算
  - `Server-Timing` 输出
  - 调试 Header 输出
  - 调试日志输出
- 触发条件：
  - `PERF_DEBUG=true` 或 `DEBUG_MODE=true`

#### 4.2.2 `/pages/info` 增加分段 timing 与返回大小埋点
- 文件：`apps/server/src/core/page/page.controller.ts`
- 已埋点：
  - page query 耗时
  - ability 耗时
  - controller total 耗时
  - response bytes
  - content bytes
- 已输出：
  - `Server-Timing`
  - `X-Docmost-*` 调试头

#### 4.2.3 `/spaces/info` 增加分段 timing，并去掉同请求内重复权限查询
- 文件：`apps/server/src/core/space/space.controller.ts`
- 已调整：
  - 查询 `space`
  - 查询 `userSpaceRoles`
  - 基于已查到的角色构造 `ability`
  - 避免同一请求里重复调用 `createForUser()` 再查一次角色
- 已埋点：
  - space query 耗时
  - role query 耗时
  - total 耗时
  - response bytes

#### 4.2.4 `SpaceAbilityFactory` 支持基于已有角色直接构造权限
- 文件：`apps/server/src/core/casl/abilities/space-ability.factory.ts`
- 已新增：
  - `createForRoles(userSpaceRoles)`
- 作用：
  - 避免 controller 已经拿到角色后又重复查库。

#### 4.2.5 `DomainMiddleware` 增加自托管 workspace 进程内缓存
- 文件：`apps/server/src/common/middlewares/domain.middleware.ts`
- 已调整：
  - 自托管模式首次查询 `findFirst()` 后缓存结果
  - 后续请求直接复用
  - Cloud 模式仍然按 hostname 查询，但增加耗时记录

#### 4.2.6 关键 repo 增加可选 debug log
- 文件：
  - `apps/server/src/database/repos/page/page.repo.ts`
  - `apps/server/src/database/repos/space/space.repo.ts`
  - `apps/server/src/database/repos/space/space-member.repo.ts`
  - `apps/server/src/database/repos/workspace/workspace.repo.ts`
- 已记录：
  - 查询耗时
  - 返回大小或结果数量

## 5. 当前未完成项

### 5.1 未执行成功的构建验证
- 当前工作区缺少依赖目录，无法完成编译验证。
- 现象：
  - `apps/client build` 报 `tsc: command not found`
  - `apps/server build` 报 `nest: command not found`
  - 默认 `pnpm` 还会因为 `corepack` 访问 npm registry 失败而报网络错误
- 当前状态：
  - 已找到本机离线 `pnpm 10.4.0` 路径
  - 但项目本身缺少 `node_modules`，因此无法做完整 build

### 5.2 未执行数据库级 `EXPLAIN ANALYZE`
- 尚未对以下查询进行真实数据库执行计划验证：
  - `pages.findById`
  - `spaces.findById`
  - `spaceMembers.getUserSpaceRoles`
  - `workspace.findByHostname`
  - `workspace.findFirst`
- 因此当前对 SQL 的判断仍属于：
  - 源码级风险分析
  - 未完成数据库实测确认

## 6. 下次会话建议的起点

### 6.1 第一优先级：完成环境验证
- 先确认本地依赖是否已安装：
  - `node_modules`
  - `apps/client/node_modules`
  - `apps/server/node_modules`
- 若无依赖：
  - 先用可用包管理器完成安装
  - 再跑 client/server build

### 6.2 第二优先级：实际跑一轮带埋点的复现
- 建议环境变量：
  - `PERF_DEBUG=true`
  - 或 `DEBUG_MODE=true`
- 复现方式：
  - 小页面 -> 大页面切换
  - 直接刷新大页面
  - 二次进入大页面
- 采集内容：
  - 浏览器 `window.__DOCMOST_PERF__`
  - 浏览器 Network 中 `Server-Timing`
  - 后端调试日志

### 6.3 第三优先级：生成首轮量化报告
- 重点形成下面几项结论：
  - `/pages/info` 服务端耗时
  - `/spaces/info` 服务端耗时
  - 总接口等待占比
  - 首屏可见时间
  - 编辑器 ready 时间
  - 主线程最长长任务
- 目标：
  - 用数据确认“前端主线程”为主因还是“接口等待”为主因。

### 6.4 第四优先级：若 SQL 占比高，再进入数据库专项优化
- 如果后续量化显示 `/pages/info` 或 `/spaces/info` 明显偏慢，再推进：
  - `EXPLAIN ANALYZE`
  - 验证 `LOWER(...)` 是否命中索引
  - 评估是否需要函数索引
  - 评估是否拆分轻量页信息与重内容字段

## 7. 建议下次新会话可直接使用的提示词

可直接在新会话中使用以下提示，让新会话基于本次归档继续推进：

```text
请先阅读 docs/perf-session-archive-2026-04-18.md。
这是上一轮关于 Docmost 大页面切换卡顿问题的完整归档。
请基于文档先检查当前代码变更状态，再继续完成以下事项：
1. 验证前后端改动是否可以正常编译运行
2. 使用 PERF_DEBUG=true 复现并采集性能数据
3. 输出首轮量化性能分析报告
4. 如果后端 SQL 占比明显，再继续做 EXPLAIN ANALYZE 和索引判断
```

## 8. 本轮涉及的核心文件
- 前端：
  - `apps/client/src/lib/perf.ts`
  - `apps/client/src/lib/api-client.ts`
  - `apps/client/src/features/page/services/page-service.ts`
  - `apps/client/src/features/space/services/space-service.ts`
  - `apps/client/src/pages/page/page.tsx`
  - `apps/client/src/features/editor/full-editor.tsx`
  - `apps/client/src/features/editor/page-editor.tsx`
- 后端：
  - `apps/server/src/common/helpers/perf.util.ts`
  - `apps/server/src/common/middlewares/domain.middleware.ts`
  - `apps/server/src/core/casl/abilities/space-ability.factory.ts`
  - `apps/server/src/core/page/page.controller.ts`
  - `apps/server/src/core/space/space.controller.ts`
  - `apps/server/src/database/repos/page/page.repo.ts`
  - `apps/server/src/database/repos/space/space.repo.ts`
  - `apps/server/src/database/repos/space/space-member.repo.ts`
  - `apps/server/src/database/repos/workspace/workspace.repo.ts`

## 9. 当前归档结论
- 本轮已经完成第一阶段实现：
  - 前后端可观测能力已接入
  - 页面切换前端双重渲染已移除
  - `/spaces/info` 同请求重复权限查询已消除
  - 自托管 workspace 重复查库已缓存
- 当前最缺的不是继续盲改，而是：
  - 完成依赖安装
  - 跑真实 build
  - 跑真实复现
  - 拿到第一轮量化证据
