# 页面属性体系交互重设计规格

> 日期：2026-07-25  
> 状态：已确认，待实施计划  
> 范围：PRD-03 页面属性体系 + PRD-05 页面属性交互重设计的核心功能  
> 标签策略：采用方案 A；本期不实施 PRD-04 标签治理系统

## 1. 目标

在不依赖 Yjs/Tiptap 编辑器、不引入外网调用、不恢复 EE 功能的前提下，将现有但未挂载的页面属性能力改造成标题下方的轻量属性条，并激活页面管理列表、空间属性开关、默认 Owner、父页面属性建议、可靠的单页/批量编辑和跨空间移动清理。

核心目标：

1. 页面默认只显示已有且空间已启用的属性；空属性不占位。
2. 有编辑权限的用户通过 chip 就地编辑；无编辑权限时只读展示。
3. 静态阅读模式下仍可读取和编辑属性，且不初始化 Yjs/Hocuspocus/Tiptap。
4. 空间管理员可控制本空间启用的属性，并维护状态集合。
5. 新页面在 Owner 启用时默认由创建者负责；新建子页面提供父页面 Owner/标签继承建议。
6. 页面管理列表支持只读筛选以及有权限用户的可靠批量修改。
7. 属性更新失败时恢复服务端值，不产生前端假成功状态。

## 2. 本期范围

### 2.1 包含

- `owner`、`status`、`priority`、`dueAt`、`tags` 五种固定属性。
- `space_page_property_configs.enabled_properties` 数据迁移、读取、更新与校验。
- 标题下方 inline 属性条。
- `+ 属性`渐进披露入口。
- 单字段就地编辑、清空和保存错误恢复。
- readMode 静态阅读态属性编辑。
- 空间属性启用开关及状态集合维护。
- 新页面默认 Owner。
- 新建子页面的父页面 Owner/标签一次性建议条。
- 标签建议按“父页面优先、空间使用频率其次”排序。
- 页面管理路由、侧栏入口、只读筛选和批量编辑。
- 页面跨空间移动时清理无效 Owner/Status。
- 现有属性更新重复请求、清空失败和批量失败处理缺陷修复。
- 英文、简体中文用户文案；其他语言使用英文 fallback。

### 2.2 不包含

- `space_tags` 表。
- 标签颜色、描述、集中治理、重命名、合并和删除。
- 标签直达页和可分享标签 URL。
- `tag:`、`status:` 等搜索语法糖。
- 标签命名空间分组。
- 自定义字段、公式、关联、JSON 字段。
- 历史页面 Owner 批量回填。
- 提醒、SLA、自动规则和 AI 自动打标。

本期标签使用普通无色 chip，不可点击；仍支持添加、删除、清空、联想和不区分大小写去重。

## 3. 已确认的 PRD 修正

原 PRD 中以下描述需要修正或补充：

1. “后端完整”不准确：单页 `null` 清空、批量逐项失败、批量 Owner、批量清空和前端重复更新请求均需修复。
2. “Owner 等于创建者且从未手改时弱化”改为“Owner 等于创建者时弱化”。现有 schema 不记录属性来源，本期不新增来源字段。
3. 父页面属性继承采用“页面创建后的一次性建议条”，不增加创建前弹窗。
4. 空间关闭属性不删除历史值；普通写接口禁止写入关闭的属性，重新启用后历史值恢复显示。
5. Owner 属性关闭时，新页面不自动写入 Owner。
6. 页面属性普通编辑继续更新 `pages.updated_at` 和全文搜索索引，但不触发 AI 正文重新嵌入。
7. 删除仍被页面使用的状态时阻止保存，不产生孤立状态。
8. 页面跨空间移动必须处理目标空间中无效的 Owner/Status。

## 4. 属性键与配置模型

统一属性键：

```ts
export const PAGE_PROPERTY_KEYS = [
  'tags',
  'owner',
  'status',
  'priority',
  'dueAt',
] as const;

export type PagePropertyKey = (typeof PAGE_PROPERTY_KEYS)[number];
```

默认配置：

```json
{
  "enabledProperties": ["tags", "owner", "status", "priority", "dueAt"],
  "statusOptions": ["Backlog", "Todo", "In Progress", "Done"]
}
```

数据库迁移在 `space_page_property_configs` 上增加：

```sql
enabled_properties jsonb not null
  default '["tags","owner","status","priority","dueAt"]'::jsonb
```

迁移不修改现有页面数据。`down()` 只删除该列。

## 5. 后端设计

### 5.1 空间配置接口

继续复用现有端点，避免不必要的 API 迁移：

- `POST /spaces/page-properties/status-config/get`
- `POST /spaces/page-properties/status-config/update`

虽然端点名称包含 `status-config`，响应和更新 DTO 扩展为完整页面属性配置：

```ts
interface SpacePagePropertyConfig {
  spaceId: string;
  workspaceId: string;
  statusOptions: string[];
  enabledProperties: PagePropertyKey[];
  createdAt: string;
  updatedAt: string;
}
```

更新请求：

```ts
interface UpdateSpacePagePropertyConfigInput {
  spaceId: string;
  statusOptions: string[];
  enabledProperties: PagePropertyKey[];
}
```

校验规则：

- `enabledProperties` 只允许五个固定键。
- 自动去重，不接受未知键。
- 允许空数组，即空间可关闭全部页面属性。
- 状态最少 1 个、最多 20 个。
- 状态 trim 后长度 1–50。
- 状态不区分大小写去重，保留首次输入的显示大小写。
- 如果被删除的状态仍被未删除页面使用，返回 `STATUS_IN_USE`，包含状态名和受影响页面数量。
- 读取权限为 Space `Read / Settings`；更新权限为 `Manage / Settings`。

### 5.2 属性写入校验

单页创建、单页更新和批量更新统一经过属性配置校验：

- 请求中出现已关闭属性时返回 `PROPERTY_DISABLED`。
- 单页更新允许用 `null` 清空 Owner、Status、Priority、Due time。
- Tags 使用空数组清空。
- 单页最多 50 个标签，单个标签 trim 后长度 1–64。
- 标签 trim、不区分大小写去重，保留首次输入大小写。
- Due time 接收 ISO 8601，数据库保存 UTC。
- Owner 必须属于当前 Workspace，并通过直接成员或群组成员关系拥有 Space 访问权。

新页面创建规则：

```ts
if (enabledProperties.includes('owner')) {
  ownerId = createPageDto.ownerId ?? actorUserId;
} else {
  ownerId = undefined;
}
```

显式提交的其他关闭属性仍被拒绝，而不是静默丢弃。

### 5.3 Owner 展示与搜索数据

页面详情响应增加 `propertyOwner` 用户摘要：

```ts
interface PropertyOwnerSummary {
  id: string;
  name: string;
  avatarUrl: string | null;
}
```

新增专用的空间 Owner 候选查询，返回通过直接成员或群组成员关系可访问 Space 的用户，并支持名称/邮箱搜索和分页。它不返回群组实体，也不返回无空间访问权的 Workspace 用户。

该查询用于：

- 页面属性 Owner 编辑器。
- 页面管理 Owner 过滤器。
- 批量 Owner 设置控件。

### 5.4 标签建议

保留现有 `/pages/properties/tags` 端点和字符串数组响应，但后端改为：

1. `unnest(property_tags)` 聚合。
2. 按标签小写值归并计数。
3. 使用首次或稳定选定的显示值。
4. 按使用次数降序、名称升序返回。

前端在此结果前插入父页面标签并去重，因此最终排序为：

1. 父页面标签。
2. 空间高频标签。
3. 同频标签按名称排序。

### 5.5 批量更新

批量请求最多 500 个页面 ID，先对 ID 去重。

属性 patch 使用显式三态：

- 字段缺失：保持不变。
- 非空值：设置。
- `null`：清空 Owner/Status/Priority/Due time。
- `tags: []`：清空标签。

全局 payload 错误（未知字段、关闭属性、非法状态、非法标签）直接返回 400，不执行任何页面。

合法 payload 对每个页面独立处理：

- 页面不存在：`NOT_FOUND`。
- Workspace/Space 不匹配：`SPACE_MISMATCH`。
- 无编辑权限：`FORBIDDEN`。
- 数据库或校验异常：使用稳定错误码和消息记录到失败明细。
- 一个页面失败不回滚此前成功页面。
- 响应包含 `successCount` 和每个失败项。

### 5.6 跨空间移动

移动根页面及其子树到目标 Space 时，在同一个事务内处理属性：

- Owner 对目标 Space 无访问权：清空。
- Status 不在目标 Space 状态集合中：清空。
- Priority、Due time 和 Tags：保留。
- 目标 Space 关闭的属性只隐藏，不因移动而清空。

移动完成后继续执行现有 share/comment/attachment Space 更新和索引事件。

## 6. 前端交互设计

### 6.1 属性条位置

编辑模式：

```text
TitleEditor
PageProperties
InheritanceSuggestion（仅新建子页面且存在建议时）
PageEditor
```

静态阅读模式：

```text
ReadonlyPageSnapshot title
PageProperties
InheritanceSuggestion（仅存在建议时）
Readonly snapshot content
```

`ReadonlyPageSnapshot` 已支持 `children`，属性条通过该插槽放在标题和正文之间。

### 6.2 属性条显示规则

- 仅显示同时满足“空间已启用”和“页面已有值”的属性。
- Owner 等于 `creatorId` 时降低文字、头像和边框对比度。
- 有编辑权限时始终保留低干扰的 `+ 属性`。
- 无编辑权限且没有可显示属性时，整个属性条不渲染。
- 使用可换行 flex 布局；标签较多时自然换行。
- 普通标签 chip 无颜色、不可导航。

### 6.3 就地编辑

- Owner：可搜索空间有效用户的 Combobox。
- Status：空间状态集合 Select。
- Priority：P0–P3 Select。
- Due time：本地时区 DateTimePicker，提交 ISO 8601。
- Tags：TagsInput，父页面标签和空间高频标签优先。
- `+ 属性`只列出已启用且当前为空的属性。
- chip 的清除按钮将属性恢复为空，并重新出现在 `+ 属性`列表。
- 选定值立即保存；Tags 在完成输入或失焦后保存。

### 6.4 保存状态和错误恢复

每个属性独立维护保存状态：

- 保存期间禁用该字段的再次提交，其他字段仍可操作。
- 保存成功后使用服务端响应更新页面 Query cache。
- 保存失败后恢复到最后一次成功的服务端值，并显示错误通知。
- 修复 `useUpdatePageMutation` 成功回调中的重复 HTTP 请求；成功回调只更新缓存和失效相关查询。

需失效的查询包括：

- 当前页面的 UUID 和 slug 两种 cache key。
- 页面管理列表。
- 页面属性标签联想。
- 相关搜索结果。
- 必要的侧栏页面元数据。

属性更新继续使用 REST，不调用协同编辑器。

### 6.5 父页面继承建议

创建子页面前，前端从 Query cache 读取父页面；缓存缺失时通过页面详情接口获取。创建成功后，为新页面写入一个仅存在于前端会话的建议对象：

```ts
interface PagePropertyInheritanceSuggestion {
  pageId: string;
  parentPageId: string;
  ownerId?: string;
  tags: string[];
}
```

显示规则：

- 父 Owner 非空且与新页面默认 Owner 不同时，显示 Owner 建议。
- 父标签去除新页面已有标签后仍非空时，显示标签建议。
- 没有有效差异时不显示建议条。

操作：

- “全部采纳”：一次请求提交所有建议字段。
- 单项采纳：只提交对应字段。
- “忽略”：移除建议，不写数据库。
- 页面离开、刷新或建议处理完成后不再次显示。

不新增数据库表记录建议或忽略状态。

## 7. 页面管理列表

新增路由：

```text
/s/:spaceSlug/manage
```

侧栏入口位于“搜索”和“空间设置”之间，所有拥有 Space 页面阅读权限的用户可见。移动端点击后关闭侧栏。

只读用户：

- 可按 Keyword、Status、Priority、Owner、Tags、Due range 筛选。
- 可排序和打开页面。
- 不显示多选框和批量编辑区域。

可编辑用户：

- 显示多选框和批量编辑区域。
- Owner 使用空间用户选择器，不输入 UUID。
- 每个字段提供“保持不变 / 设置 / 清空”的明确操作。
- Tags 支持“替换全部 / 清空”，本期不做追加或集合差操作。
- 批量完成后显示成功数和可展开的失败明细。

空间关闭的属性在该页隐藏对应筛选器、列和批量控件。

## 8. 空间设置

扩展现有 `SpacePagePropertySettings`，不创建新的设置路由。

页面属性区包含：

1. 五个属性启用开关。
2. 状态启用时显示状态集合编辑器。
3. 关闭属性时显示“数据保留，重新启用后恢复”的说明。
4. 一次保存完整配置。

空间管理员可编辑；其他空间成员按现有设置权限只读查看。

## 9. 权限矩阵

| 功能 | Space Reader | Space Writer | Space Admin |
|---|---:|---:|---:|
| 查看属性条 | 是 | 是 | 是 |
| 编辑单页属性 | 否 | 是 | 是 |
| 查看页面管理列表 | 是 | 是 | 是 |
| 使用批量编辑 | 否 | 是 | 是 |
| 查看属性配置 | 是 | 是 | 是 |
| 修改属性配置 | 否 | 否 | 是 |
| 查询 Owner 候选 | 是 | 是 | 是 |

实际鉴权继续由服务端 CASL 决定，前端隐藏控件不能替代服务端校验。

## 10. 数据边界

- 历史页面不回填 Owner。
- 单页标签最多 50 个。
- 单标签长度 1–64。
- 状态最多 20 个，单状态长度 1–50。
- 批量页面最多 500 个。
- 所有日期存 UTC、按浏览器本地时区显示。
- 所有列表和搜索访问继续受 Workspace/Space 边界约束。
- 不引入外网资源、遥测、CDN 或 EE 代码。

## 11. 测试与验证

### 11.1 后端 Jest

新增或重写可实际运行的 PageService、SpaceService 和 Controller 测试，覆盖：

- Owner 启用时默认创建者。
- Owner 关闭时不回填。
- 关闭属性写入返回 `PROPERTY_DISABLED`。
- 单页使用 `null` 清空四个 nullable 属性。
- 标签限制、trim 和不区分大小写去重。
- 配置合法键过滤与空启用集合。
- 状态不区分大小写去重。
- 使用中的状态不能删除。
- 批量 ID 去重。
- 批量部分失败仍返回成功/失败明细。
- 跨空间移动清空无效 Owner/Status，保留其他值。
- Owner 候选只返回有目标 Space 访问权的用户。

### 11.2 前端验证

仓库不引入前端测试框架。通过以下方式验证：

- `pnpm client:build` 完成 TypeScript 和 Vite 构建。
- 前端 ESLint/Prettier。
- 浏览器验证编辑模式、用户偏好 readMode、大文档 readMode、只读权限、移动端侧栏和 BASE_PATH 路由。
- 浏览器网络面板确认单次属性操作只发送一次更新请求。

### 11.3 全量验证

- 相关 Jest 测试。
- `pnpm server:build`。
- `pnpm client:build`。
- 改动文件 lint/format。
- 如修改共享编辑器扩展才运行 `pnpm editor-ext:build`；本设计预计不修改 `packages/editor-ext`。

## 12. 实施边界与文件组织

后端改动集中在：

- `apps/server/src/core/page/`
- `apps/server/src/core/space/`
- `apps/server/src/database/repos/page/`
- `apps/server/src/database/repos/space/`
- `apps/server/src/database/migrations/`
- 由 codegen 生成的 `apps/server/src/database/types/db.d.ts`

前端改动集中在：

- `apps/client/src/features/page/components/`
- `apps/client/src/features/page/queries/`
- `apps/client/src/features/page/services/`
- `apps/client/src/features/page/types/`
- `apps/client/src/features/editor/full-editor.tsx`
- `apps/client/src/features/space/components/`
- `apps/client/src/features/space/queries/`
- `apps/client/src/features/space/services/`
- `apps/client/src/pages/space/space-page-manage.tsx`
- `apps/client/src/features/space/components/sidebar/space-sidebar.tsx`
- `apps/client/src/App.tsx`
- i18n 资源文件

不修改 `apps/client/src/ee/`、`apps/server/src/ee/` 和 `packages/ee/`。

## 13. 完成标准

只有在以下条件全部满足时，页面属性核心功能才算完成：

1. 属性条在编辑模式和静态阅读模式均正确显示。
2. 单页五类属性可设置、清空、错误恢复。
3. 空间属性开关能控制所有相关 UI 和写 API。
4. 默认 Owner、父页面建议和标签排序符合本规格。
5. 页面管理列表路由、权限、筛选和批量操作可用。
6. 页面跨空间移动不会留下无效 Owner/Status。
7. 没有重复更新请求。
8. 后端相关测试、server build、client build 和改动文件 lint/format 通过。
9. BASE_PATH、离线部署和 EE 禁用约束未被破坏。
