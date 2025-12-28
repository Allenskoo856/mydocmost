# 本地启动测试指南

## 当前状态
✅ 环境文件已创建 (`.env`)
✅ APP_SECRET 已生成并配置

## 完整启动流程

### 1. 启动 Docker 服务（必需）

首先需要启动 Docker Desktop 应用程序，然后启动数据库和 Redis：

```bash
# 启动 Postgres 和 Redis
docker compose up -d db redis
```

**验证容器运行状态**：
```bash
docker ps
```

应该看到两个容器：
- `mydocmost-db-1` (Postgres)
- `mydocmost-redis-1` (Redis)

### 2. 安装依赖

```bash
pnpm install
```

### 3. 初始化数据库

```bash
# 运行所有迁移（包括新增的 parent_page_id 字段）
pnpm --filter ./apps/server run migration:latest

# 生成 Kysely 类型定义
pnpm --filter ./apps/server run migration:codegen
```

### 4. 启动开发服务器

```bash
# 同时启动前端和后端
pnpm dev
```

这会启动：
- **前端**: http://localhost:5173 (Vite 开发服务器)
- **后端**: http://localhost:3000 (NestJS API)

### 5. 访问应用

在浏览器打开：**http://localhost:5173**

首次运行会自动重定向到 `/setup/register` 进行初始化设置。

## 测试多级页面导入功能

### 准备测试数据

创建一些测试文件：

1. **simple.md** (简单 Markdown)
```markdown
# 测试页面

这是一个测试页面的内容。

## 子标题

- 列表项 1
- 列表项 2
```

2. **test-structure.zip** (包含目录结构的 ZIP)
```
test-structure/
├── root-page.md
├── folder1/
│   ├── child-page-1.md
│   └── folder2/
│       └── nested-page.md
└── another-root.md
```

### 测试步骤

#### 测试 1: 导入到空间根（验证向后兼容）

1. 创建一个测试空间
2. 点击空间侧边栏的溢出菜单（`···`）
3. 选择 "Import pages"
4. 上传 `simple.md` 或 ZIP 文件
5. ✅ 验证：页面应该出现在空间根级别

#### 测试 2: 导入单页到二级页面（新功能）

1. 在空间根创建一个页面（如 "测试父页面"）
2. 在树中找到这个页面，点击右侧的 `···` 菜单
3. 选择 "**Import into this page**"（新增选项）
4. 上传 Markdown 文件
5. ✅ 验证：
   - 新页面应该成为"测试父页面"的子页
   - 在树中展开父页面可以看到新导入的页面

#### 测试 3: 导入 ZIP 到三级页面（新功能）

1. 创建页面层级：根页 → 二级页 → 三级页
2. 在三级页面的菜单中点击 "Import into this page"
3. 上传包含多层目录的 ZIP 文件
4. 等待导入完成（会显示进度通知）
5. ✅ 验证：
   - ZIP 内部的"根"文件成为三级页的子页（四级）
   - ZIP 内部的目录结构保持相对层级关系
   - 可以在树中展开查看完整层级

#### 测试 4: 校验逻辑测试

**测试锁定页面**：
1. 创建一个页面并锁定它（页面设置中）
2. 尝试导入到这个锁定页面
3. ✅ 验证：应该显示错误 "Cannot import to locked page"

**测试跨空间**：
1. 在 API 层面尝试将页面导入到另一个空间的页面下
2. ✅ 验证：应该显示错误 "Parent page must be in the same space"

## 常见问题排查

### 问题 1: Docker 连接失败
```
Cannot connect to the Docker daemon
```
**解决方案**: 打开 Docker Desktop 应用程序

### 问题 2: 端口已被占用
```
Error: listen EADDRINUSE: address already in use :::3000
```
**解决方案**: 
```bash
# 查找占用端口的进程
lsof -ti:3000
# 杀掉进程
kill -9 <PID>
```

### 问题 3: 数据库连接失败
```
Failed to connect to database
```
**解决方案**:
```bash
# 检查容器状态
docker ps

# 重启容器
docker compose restart db

# 查看数据库日志
docker compose logs db
```

### 问题 4: 迁移失败
```
Migration failed
```
**解决方案**:
```bash
# 重置数据库（警告：会删除所有数据）
docker compose down -v
docker compose up -d db redis

# 重新运行迁移
pnpm --filter ./apps/server run migration:latest
```

### 问题 5: 前端编译错误
**解决方案**:
```bash
# 清理缓存并重新安装
rm -rf node_modules apps/*/node_modules packages/*/node_modules
rm -rf .nx apps/*/.nx
pnpm install
```

## 开发工具推荐

### 查看 API 请求
打开浏览器开发者工具（F12）→ Network 标签，筛选 XHR 请求，可以看到：
- `POST /api/pages/import` - 单页导入
- `POST /api/pages/import-zip` - ZIP 导入
- `GET /api/file-task/:id` - 查询导入任务状态

### 查看数据库
```bash
# 进入 Postgres 容器
docker exec -it mydocmost-db-1 psql -U docmost -d docmost

# 查询页面层级
SELECT id, title, parent_page_id, position FROM pages WHERE space_id = 'your-space-id' ORDER BY position;

# 查询文件任务
SELECT id, file_name, status, parent_page_id FROM file_tasks ORDER BY created_at DESC LIMIT 10;

# 退出
\q
```

### 查看 Redis
```bash
# 进入 Redis 容器
docker exec -it mydocmost-redis-1 redis-cli

# 查看所有键
KEYS *

# 退出
exit
```

### 后端日志
后端日志会在终端实时显示，包括：
- 导入请求接收
- 父页面校验结果
- Position 生成
- 页面创建成功
- 任务处理进度

关键日志示例：
```
[ImportController] Validating targetParentId: xxx
[ImportService] Creating page with parentPageId: xxx
[FileImportTaskService] Processing 50 pages...
[FileImportTaskService] Successfully imported 120 pages with 45 backlinks
```

## 性能监控

### 导入大型 ZIP 文件
```bash
# 监控任务队列
docker exec -it mydocmost-redis-1 redis-cli

# 查看队列长度
LLEN bullmq:file-task-queue:wait
LLEN bullmq:file-task-queue:active

# 查看内存使用
INFO memory
```

### 数据库性能
```bash
# 查看慢查询
docker exec -it mydocmost-db-1 psql -U docmost -d docmost -c "SELECT * FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
```

## 停止服务

```bash
# 停止开发服务器
# 在运行 pnpm dev 的终端按 Ctrl+C

# 停止 Docker 容器
docker compose down

# 停止并删除数据（谨慎使用）
docker compose down -v
```

## 快速重启

如果需要完全重置环境：

```bash
# 1. 停止所有服务
docker compose down -v

# 2. 启动数据库
docker compose up -d db redis

# 3. 重新初始化数据库
pnpm --filter ./apps/server run migration:latest
pnpm --filter ./apps/server run migration:codegen

# 4. 启动开发服务器
pnpm dev
```

## 下一步

启动成功后，按照 `TEST_CHECKLIST.md` 中的测试清单进行功能验证。

重点测试：
1. ✅ 单页导入到二级/三级页面
2. ✅ ZIP 导入保持层级结构
3. ✅ 父页面校验逻辑
4. ✅ 前端菜单和弹窗交互
5. ✅ 导入完成后的刷新机制
