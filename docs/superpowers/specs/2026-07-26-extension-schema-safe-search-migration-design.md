# PostgreSQL 扩展 Schema 安全搜索迁移设计

> 日期：2026-07-26
> 状态：规格已确认，实施完成

## 背景

内网环境启动时，Kysely 执行中文搜索迁移失败。PostgreSQL 返回
`42883 undefined_function`，错误上下文为 SQL 函数 `f_unaccent` 内联期间执行
`SELECT unaccent($1)`。

数据库中已经登记安装 `unaccent` 扩展，但迁移使用未限定 schema 的
`unaccent` 函数和 `gin_trgm_ops` 操作符类。这隐含假设扩展安装 schema
始终位于应用连接的 `search_path` 中；内网现有数据库不满足该假设。

## 目标

- 兼容扩展安装在 `public` 或其他自定义 schema 的已有数据库。
- 兼容项目基线 PostgreSQL 16，并避免依赖 PostgreSQL 18 的特殊行为。
- 不移动扩展、不修改数据库角色或数据库级 `search_path`。
- 修复当前失败的升级路径，同时保证全新数据库初始化可用。
- 在扩展元数据异常时返回明确错误。

## 非目标

- 本次不调整内网 PostgreSQL 18 到 PostgreSQL 16。
- 本次不修改全文搜索算法、索引字段范围或查询排序逻辑。
- 本次不自动安装系统缺失的 PostgreSQL contrib 扩展文件。

## 设计

新增一个数据库扩展辅助模块，职责保持单一：

1. 从 `pg_extension` 和 `pg_namespace` 查询指定扩展的实际安装 schema。
2. 扩展不存在或查询不到 schema 时抛出包含扩展名的明确错误。
3. 使用 Kysely 的标识符构造能力生成安全的 schema 限定对象名，避免字符串拼接和
   schema 名称中的特殊字符导致 SQL 注入或语法错误。

迁移在执行 `CREATE EXTENSION IF NOT EXISTS` 后查询扩展 schema：

- `f_unaccent(text)` 的函数体调用
  `"<unaccent_schema>".unaccent($1)`。
- 页面标题和正文 GIN 索引使用
  `"<pg_trgm_schema>".gin_trgm_ops`。

需要同时调整两个迁移：

- 旧的 unaccent/tsvector 迁移：保证全新数据库初始化不会依赖 `search_path`。
- 当前中文搜索迁移：保证正在失败的内网升级能够重试成功，并提前覆盖
  `gin_trgm_ops` 的同类 schema 可见性问题。

Kysely 迁移失败时不会记录该迁移成功，因此当前失败迁移在部署修复版本后可以正常重试。

## 错误处理

- `CREATE EXTENSION` 权限不足：保留 PostgreSQL 原始错误，便于定位数据库权限。
- 扩展登记不存在：辅助模块抛出明确错误，指出缺失扩展名称。
- 扩展 schema 中对象缺失：保留 PostgreSQL 的对象解析错误，表明扩展安装可能损坏。
- 索引已存在：继续使用 `CREATE INDEX IF NOT EXISTS`，支持安全重试。

## 测试

采用测试驱动实现：

1. 单元测试先证明当前实现无法生成 schema 限定的扩展对象名。
2. 覆盖普通 schema 和包含引号等特殊字符的 schema，验证标识符被安全引用。
3. 覆盖扩展查询无结果时的明确错误。
4. 验证两个迁移均调用扩展 schema 查询，并在生成 SQL 时使用限定名称。
5. 运行相关 Jest 测试、全部服务端单元测试及 `pnpm server:build`。

如本机存在可用 PostgreSQL/Docker，再增加一次自定义扩展 schema 的迁移集成验证；
若环境不具备条件，将在交付说明中明确标注未执行。

## 部署与回滚

构建新应用镜像后替换内网应用容器并重新启动。应用启动会重新执行尚未成功记录的迁移，
无需手工删除迁移记录或索引。

代码回滚不会自动回滚已创建的索引；索引和函数保持向后兼容，不影响旧版本读取。
若修复版本仍失败，应保留完整迁移日志，并先查询扩展 schema、函数签名和
`pg_function_is_visible`，不要直接删除扩展或数据库卷。
