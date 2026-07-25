# PRD：Docmost AI 能力整合（知识库问答与写作助手）

> 状态：MVP(P0) 已实现（待真机联调）
> 版本：v0.3
> 日期：2026-07-25
> MVP 锚点：知识库 AI 问答（RAG，带出处引用）
> 对应定位：`mydocmost` 内网 / 离线定制 Fork，AI 能力须在无外网环境可用
>
> **关键约束（已确认，零新增容器/硬件）**：不引入 pgvector、**不改 PG 镜像**；LLM 与 Embedding 复用内网**现有**端点（Embedding = bge-m3 / 1024 维）；检索支持 **CPU 降级**；流式传输 = **SSE**；**MCP 复用**同一检索服务；附件 / 图片暂不索引。

---

## 0. 实现状态（v0.3，P0 已落地）

复用了仓库既有的 AI 脚手架（上游 EE 遗留的 enqueue 链路），只补齐了被 EE 拿走的消费端：

- **环境变量**沿用既有命名：`AI_DRIVER=openai`、`OPENAI_API_URL`(含 `/v1`)、`OPENAI_API_KEY`、`AI_EMBEDDING_MODEL=bge-m3`、`AI_COMPLETION_MODEL=<内网LLM>`、`AI_EMBEDDING_DIMENSION=1024`；新增调优项 `AI_RAG_TOP_K`/`AI_VECTOR_CANDIDATE_LIMIT`/`AI_CHUNK_SIZE`/`AI_CHUNK_OVERLAP`/`AI_MAX_CONTEXT_CHARS`/`AI_REQUEST_TIMEOUT_MS`（见 `.env.internal.example`）。
- **数据表**：`page_embeddings`（迁移 `20260725T120000-page-embeddings.ts`），`embedding real[]`，无扩展；chunk 文本存 `metadata.text`，增量哈希存 `metadata.hash`。
- **模型客户端** `core/ai/ai-model.service.ts`：fetch 版 OpenAI 兼容 chat(流式)+embeddings，无 SDK 依赖。
- **索引** `core/ai/ai-indexing.service.ts` + `ai.processor.ts`：消费既有 `AI_QUEUE`（页面增改删、移动、工作区回填/删除、空间删除），AI 关闭或表缺失时安全 no-op。
- **检索** `core/ai/ai-retrieval.service.ts`：权限过滤(用户可读 space) + FTS 候选召回 + 内存暴力余弦重排，纯 CPU；对 MCP 提供工作区级 `allowedSpaceIds` 通道。
- **问答** `POST /api/ai/ask`(SSE) → citations/token/done/error 事件；接口 `GET /api/ai/status`。
- **前端** `features/ai/`：右侧 Ask 面板(作用域选择/流式回答/引用卡片跳转) + Cmd+K「Ask AI」命令 + 页头机器人按钮，全部受 `window.CONFIG.AI_ENABLED` 门控。
- **MCP**：新增 `semantic_search` 工具，复用同一检索服务（Agent 用户按工作区 scope）。
- ✅ 已通过：`pnpm server:build`、`pnpm client:build`(Node22)、改动文件 ESLint/Prettier。❌ 待真机联调（内网端点 + 中文检索质量）。

---

## 1. 背景与目标

### 1.1 背景

`mydocmost` 已具备完整的空间（Space）、页面（Page）、权限（CASL）、全文搜索（Postgres FTS + 中文 pg_trgm）与 MCP Agent 接口。但对研发团队而言，知识库的核心痛点不是「写得快」，而是 **「问不到、搜不准、只能去问人」**：

- 关键字搜索命中的是「包含这个词的页面」，而不是「这个问题的答案」；跨页面、需要综合多篇文档才能回答的问题（如「我们的鉴权流程是怎样的？」）无法直接得到答案。
- 知识随人走，新人 onboarding、跨团队协作时反复打断他人。
- 现有搜索无法理解自然语言问句，也无法给出「答案 + 依据来源」。

同时，项目已有很好的地基可复用：Postgres 16、Redis、BullMQ 队列、`@nestjs/event-emitter` 事件、页面 `textContent`（纯文本）与 `content`（ProseMirror JSON 结构）、成熟的空间级权限模型，以及 Markdown ↔ ProseMirror 转换链路。

### 1.2 目标

在**不引入任何外网依赖**的前提下（契合内网离线定位），把静态 wiki 升级为「可被自然语言提问、答案带出处引用」的知识库，并为后续的编辑器内 AI 助手、代码转文档能力打好统一的模型接入与检索地基。

MVP 一句话价值：**让研发在 Docmost 里用一句话问出答案，并一键跳到答案所在的原文。**

### 1.3 非目标（整体）

- 不做外部云大模型直连为默认路径（离线优先，见 §7.3）。
- 不做模型训练 / 微调 / 私有模型托管（模型由平台方以 OpenAI 兼容服务提供）。
- 不替代现有 Hocuspocus 协同编辑与 MCP Agent 写入链路。

---

## 2. 术语

| 术语 | 说明 |
|------|------|
| RAG | Retrieval-Augmented Generation，先检索相关内容再让大模型基于检索结果作答 |
| Chunk | 页面正文按结构切分出的文本块，是检索与引用的最小单位 |
| Embedding | 文本的向量表示，用于语义相似度检索 |
| 向量检索 | 基于 embedding 余弦相似度的近邻检索（本项目用**内存暴力余弦**，不引入 pgvector） |
| 混合检索 | 向量检索 + 关键字检索（FTS）结果融合，提升召回 |
| OpenAI 兼容端点 | 实现 `/v1/chat/completions`、`/v1/embeddings` 协议的服务（vLLM / TEI / Xinference / 内部 AI 网关等） |
| 出处引用 | 答案中标注 `[n]`，对应可点击跳转的原文页面 / 段落 |

---

## 3. 用户与场景

### 3.1 目标用户（研发团队为主）

| 角色 | 诉求 |
|------|------|
| 一线开发 | 快速查到「怎么做/为什么这么设计/接口怎么调」，减少打断他人 |
| 新人 | onboarding 期用自然语言问架构、规范、环境搭建 |
| Tech Lead / 架构师 | 让沉淀的设计文档「被检索到、被复用」，减少重复答疑 |
| 知识 / 空间管理员 | 关注索引覆盖率、答案质量、成本与合规 |

### 3.2 核心场景

1. **答疑**：「我们的登录鉴权用的是什么方案，token 存哪？」→ 综合多篇文档给出答案 + 引用。
2. **定位**：「限流相关的配置在哪篇文档？」→ 语义命中并直达原文段落。
3. **onboarding**：「本地怎么把服务跑起来？」→ 汇总 `LOCAL_STARTUP_GUIDE` 等页面作答。
4. **跨空间检索**（有权限时）：在允许范围内跨空间综合作答。

---

## 4. 范围

### 4.1 In Scope（MVP / P0：知识库 AI 问答）

| 能力 | 说明 |
|------|------|
| 增量索引管道 | 页面创建/更新/删除时，异步切块 + 向量化 + 落库；支持全量回填/重建 |
| 向量存储（无 pgvector） | **不改 PG 镜像**：embedding 存普通列（`bytea`），新增 `page_chunks` 表 |
| 混合检索（CPU 可跑） | FTS（`pages.tsv`）候选召回 + 内存暴力余弦重排，强制**权限过滤**；无需 ANN 索引 / GPU |
| RAG 问答 | 基于检索结果流式生成答案，**必须带出处引用**，无依据则明确「未找到」 |
| 作用域选择 | 整个工作区（受权限约束）/ 当前空间 / 当前页面 |
| 多轮追问 | 会话上下文内可继续追问 |
| 前端问答面板 | 右侧 aside 面板 + Cmd+K 入口，流式回答 + 可点击引用卡片 + 反馈 |
| 模型接入抽象层 | 统一 OpenAI 兼容客户端（LLM + Embedding），可配置端点/模型 |
| 管理配置 | 开关、端点、模型、TopK 等经环境变量配置；工作区级开关 |
| 度量与反馈 | 会话/查询日志、token 用量、答案「有帮助/无帮助」反馈 |

### 4.2 Out of Scope（MVP 不做，进入路线图或后续）

- 编辑器内 AI 助手（P1，见 §9）。
- 代码转文档 + 图表生成（P2，见 §9）。
- 附件 / 图片内容理解（OCR、图片问答）——后续评估。
- 语音输入、跨语言问答优化（先保证中英文可用）。
- 面向外部 Agent 的对话式 API（MCP 已覆盖工具层，问答面板为人机界面）。

---

## 5. 产品形态与核心体验

### 5.1 入口

1. **Cmd+K 命令面板**：现有命令面板新增「向文档提问 / Ask AI」命令（复用 `use-command-palette-actions.ts` 的模式）。
2. **AI 助手按钮**：页头 / 全局侧栏一个入口，打开右侧 **aside 面板**（复用现有 Comments / TOC 的 aside 交互与状态机）。
3. **空搜索态引导**：搜索无结果时提示「用一句话问问 AI」。

### 5.2 问答面板交互

- 顶部：作用域选择器（工作区 / 当前空间 / 当前页面），默认「当前空间」。
- 中部：流式渲染答案（Markdown），答案中的 `[1] [2]` 为可点击引用。
- 底部：输入框（支持多轮追问）、发送、停止生成。
- 引用卡片：展示「页面标题 · 所在标题路径（面包屑）」，点击**跳转到原页面并高亮命中段落**（复用 `buildPageUrl` 深链）。
- 反馈：每条答案可「有帮助 / 无帮助」（对齐模板中心 PRD 的反馈机制）。
- 权限：面板仅在允许的作用域内检索与展示；越权内容永不进入上下文。

### 5.3 关键体验原则

- **有据可依**：答案必须引用真实页面；检索为空时回答「在你有权限的范围内未找到相关内容」，不编造。
- **可追溯**：从答案一键回到原文，鼓励「AI 给线索、人看原文」。
- **低打扰**：默认关闭；开启后不改变现有编辑/阅读主路径的性能表现。

---

## 6. 功能需求详述（MVP）

### 6.1 索引管道（Indexing）

**触发**：
- 页面正文变更（新建 / 编辑保存 / 恢复历史）→ 去抖后入队。可挂接 REST 更新路径与协同持久化落库点（`collaboration/extensions/persistence.extension.ts` 的 `onStoreDocument`），经 `@nestjs/event-emitter` 发事件 → BullMQ 队列 `ai-index`。
- 页面删除 / 移入回收站 → 入队删除该页 chunks。
- 管理员触发的空间 / 工作区**全量回填**与**重建**（换 embedding 模型时需重建）。

**处理（Worker）**：
1. 取页面 `content`（ProseMirror JSON）与 `textContent`；
2. **结构感知切块**：按标题层级切分，保留 `heading_path`（标题面包屑），块大小/重叠可配（默认 ~500 tokens / 重叠 ~80）；
3. 逐块计算 `content_hash`，与库中现有块 diff，**仅对变更块重新 embedding**（省算力，关键）；
4. 批量调用 Embedding 端点，`upsert` 进 `page_chunks`，删除已消失的块；
5. 记录索引状态（成功/失败/lag）。

**设计要点**：索引完全在服务端 worker 异步进行，**不进入前端主线程与编辑热路径**（呼应 `context.md` 的大文档性能约束）；协同持久化本身有去抖，索引最终一致即可。

### 6.2 检索管道（Retrieval，无 pgvector / CPU 可跑）

采用「先缩小候选，再暴力精排」的两段式，全程可在 CPU 上运行，不依赖 ANN 索引 / GPU：

1. **权限先行**：由调用方身份（登录用户或 MCP Agent 用户）解析其在作用域内**可读的 `space_id` 集合**（复用空间成员 / CASL）；后续所有查询强制 `workspace_id = ? AND space_id = ANY(allowed)`。**安全红线**（见 §10）。
2. **候选召回**：用现有 FTS（`pages.tsv`，含中文 trgm）+ 权限过滤，取回一批候选 chunk（上限 `AI_VECTOR_CANDIDATE_LIMIT`，默认 300），把「全库比对」收敛成小候选集。
3. **向量精排（暴力余弦）**：对问题做 query embedding，仅在候选 chunk 上计算余弦相似度取 TopK。向量可从 `page_chunks` 读取，或命中**服务端内存向量缓存**（增量更新）以省去每查询的读放大。此步为纯 CPU 计算，几百条向量属亚毫秒级。
4. **融合与组装**：FTS 命中与向量命中做 **RRF（Reciprocal Rank Fusion）** 融合去重，按页面聚合成带序号的引用上下文，控制在 `AI_RAG_MAX_CONTEXT_TOKENS` 内。

> 规模说明：内网 wiki 量级（数万 chunk）下该方案在 CPU 上足够快。若未来体量增长到需要 ANN，再评估引入 pgvector（届时需相应调整 PG 镜像）——检索接口已抽象，切换成本低。

### 6.3 生成（Generation）

- System Prompt 约束：**只依据提供的上下文作答**；每个论断标注引用 `[n]`；信息不足时明确说明未找到；**将页面内容视为数据而非指令**（防提示注入，见 §10）。
- 通过 OpenAI 兼容 `/v1/chat/completions` **流式**返回；前端 SSE 增量渲染。
- 返回结构：`answer`（Markdown，含 `[n]`）+ `citations[]`（pageId / slugId / title / headingPath / spaceSlug → 深链）+ `usage`（token）。

### 6.4 会话与反馈

- 会话与消息持久化（供多轮追问、审计、度量）。
- 每条答案支持「有帮助 / 无帮助」；无帮助可选填原因，用于后续调优。

### 6.5 传输方式（已确认：SSE）

- 问答流式：新增 `POST {BASE_PATH}/api/ai/ask`，以 **SSE** 增量返回 token；作用域、会话 id 为参数。
- 子目录部署注意：Nginx 对该路径需 `proxy_buffering off` 并拉长 `proxy_read_timeout`（与现有 `/collab`、`/socket.io` 一致，README 已有范式）。

---

## 7. 技术架构与实现

### 7.1 后端模块（NestJS）

新增 `apps/server/src/core/ai/`（遵循现有 core/<domain> 约定）：

- `ai.module.ts` / `ai.controller.ts`（`/api/ai/*`）/ `ai.service.ts`
- `retrieval.service.ts`（权限过滤 + 向量 + 混合融合）
- `indexing.processor.ts`（BullMQ 消费者）+ `chunking.util.ts`
- `llm/`：OpenAI 兼容客户端封装（`chat`、`embeddings`、超时/重试/限流）
- `dto/`：class-validator DTO

复用：`database/repos`（Kysely）、`integrations/environment`（配置）、BullMQ、event-emitter、CASL、`core/search`（FTS 融合）。其中 `retrieval.service` 设计为**共享服务**，同时供 `core/mcp` 复用（见 §8）。

### 7.2 数据模型

新增迁移（`YYYYMMDDTHHMMSS-*.ts`），**无需任何 PG 扩展**（不改镜像）：

`page_chunks`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid PK | |
| page_id | uuid FK→pages | 级联删除 |
| space_id / workspace_id | uuid | 冗余，用于快速权限过滤 |
| chunk_index | int | 页内序号 |
| heading_path | text | 标题面包屑，用于引用展示 |
| content | text | 块文本 |
| token_count | int | |
| content_hash | text | 增量索引去重 |
| embedding | `bytea` | 打包的 1024×float32（=4096B/块）；**不使用 pgvector** |
| embedding_dim | int | 记录维度（bge-m3 = 1024） |
| embedding_model | text | 记录模型，换模型触发重建 |
| created_at / updated_at | timestamptz | |

索引：`btree(page_id)`、`btree(workspace_id, space_id)`（权限 / 候选过滤用）。**不建 ANN 索引**；相似度为候选集上的内存暴力计算（见 §6.2）。

辅助表：`ai_conversations`、`ai_messages`（含 citations、usage、feedback）、`ai_index_state`（页面索引状态/lag）。

> 生成 `db.d.ts` 需跑 `migration:codegen`（禁止手改类型）。

### 7.3 模型接入（已确认：复用内网现有端点）

- **统一 OpenAI 兼容抽象**：LLM 与 Embedding 均通过可配置 `base_url + api_key + model` 访问内网**现有**服务，**不触外网、不新增推理容器 / 硬件**。
- **LLM**：使用内网已有大模型端点（生成走流式）。
- **Embedding**：使用内网已部署的 **bge-m3**（1024 维，多语言 / 中文强）。若其接口非 OpenAI 形态（如 TEI / Xinference / vLLM），在抽象层加一层薄适配即可。
- **CPU 降级（已确认要求）**：检索链路（候选召回 + 暴力余弦）本身即 CPU 可跑；query embedding 也可指向 bge-m3 的 **CPU 实例**作为降级（更慢但不阻断）。索引侧用增量哈希 + 批处理压低算力峰值。

### 7.4 环境变量（草案，`AI_` 前缀）

| 变量 | 默认 | 说明 |
|------|------|------|
| `AI_ENABLED` | `false` | 总开关，关闭时接口存在但返回 403/未启用 |
| `AI_LLM_BASE_URL` / `AI_LLM_API_KEY` / `AI_LLM_MODEL` | 空 | 对话模型（OpenAI 兼容） |
| `AI_EMBEDDING_BASE_URL` / `AI_EMBEDDING_API_KEY` / `AI_EMBEDDING_MODEL` | 空 | 向量模型 |
| `AI_EMBEDDING_DIM` | `1024` | bge-m3 = 1024；变更需重建索引 |
| `AI_VECTOR_CANDIDATE_LIMIT` | `300` | FTS 候选上限（暴力精排的候选集大小） |
| `AI_EMBEDDING_CACHE` | `true` | 是否在服务端内存缓存 chunk 向量以省读放大 |
| `AI_RAG_TOP_K` | `8` | 最终喂给 LLM 的检索条数 |
| `AI_RAG_MAX_CONTEXT_TOKENS` | `3000` | 上下文预算 |
| `AI_CHUNK_SIZE` / `AI_CHUNK_OVERLAP` | `500 / 80` | 切块参数 |
| `AI_REQUEST_TIMEOUT_MS` | `60000` | 单次模型请求超时 |
| `AI_RATE_LIMIT_RPS` / `AI_MAX_CONCURRENCY` | `2 / 4` | 每用户限流 / 全局并发上限 |

### 7.5 前端（React + Mantine）

- 新增 `apps/client/src/features/ai/`：`components/`（ask 面板、引用卡片、作用域选择器）、`services/`（走 `lib/api-client` + SSE）、`atoms/`（jotai 会话状态）、`queries/`（TanStack Query）。
- 复用：aside 面板机制、i18n（英文即 key + 回退）、命令面板入口、`buildPageUrl` 深链与命中高亮。
- 面板与入口在 `AI_ENABLED=false` 时不渲染。

---

## 8. 与现有能力的关系（复用而非重造）

| 现有能力 | 复用方式 |
|----------|----------|
| Postgres FTS（`pages.tsv` + 中文 trgm） | 作为混合检索的关键字召回分支 |
| CASL / 空间权限 | 检索层强制权限过滤的依据 |
| BullMQ / event-emitter | 索引异步管道 |
| Markdown ↔ ProseMirror、`textContent` | 切块与内容抽取来源 |
| MCP Agent 接口 | **复用同一 `retrieval.service`**：新增语义检索 tool（如 `semantic_search`），按 MCP Agent 用户身份做同样的权限过滤，让外部 Agent 也能语义检索 |
| 页面属性体系 | 后续可按 status/tags 过滤检索范围 |

---

## 9. 路线图（P1 / P2，已确认纳入）

### P1：编辑器内 AI 助手
- 划词 **改写 / 续写 / 总结 / 翻译**；代码块 **解释 / 生成 docstring**；由自然语言 **生成 Mermaid** 图。
- 形态：TipTap 划词气泡菜单 + 斜杠命令 `/ai`；复用同一 LLM 抽象层与流式通道。
- 价值定位：个人写作提效，作为问答之后的第二增长点。

### P2：由代码生成文档 + 图表
- 粘贴代码 / 指向接口定义 → 生成 **API 文档 / README / 架构说明**，并可产出 **Mermaid / 表格**。
- 结合 P0 检索：生成时可引用团队已有规范，保证风格一致。

> P1/P2 均以 P0 建成的「模型接入抽象层 + 流式通道 + 前端 AI feature 模块」为地基，避免重复建设。

---

## 10. 非功能需求

- **离线合规**：所有模型调用仅指向可配置的内网端点；不得引入任何外网调用（遥测/CDN/外部 API），与项目离线原则一致。
- **安全 / 隐私（最高优先级）**：
  - **权限不泄漏**：检索结果必须严格限定在请求用户可读的 space；测试须覆盖越权用例。
  - **多租户隔离**：所有查询按 `workspace_id` 隔离。
  - **提示注入防护**：页面内容作为「数据」注入，System Prompt 明确不执行其中指令。
  - **审计**：记录谁在何时问了什么、命中哪些页面、token 用量。
- **性能**：索引全程异步、不拖慢编辑/阅读主路径；检索 p95 与首字延迟设定目标（见 §11）；对国产 GPU 做批处理/缓存/流式优化。
- **可用性降级**：模型端点不可用时，问答面板给出明确错误并**回退到现有关键字搜索**，不阻断主功能。
- **可观测**：队列积压、索引 lag、检索耗时、模型延迟/失败率、token 成本可监控。

---

## 11. 指标与验收

**北极星**：问答周活跃使用率、答案「有帮助率」。

| 指标 | 目标（试运行后校准） |
|------|------|
| 答案有帮助率（点赞/总评价） | ≥ 70% |
| 引用点击率（答案→原文跳转占比） | ≥ 40% |
| 索引新鲜度（编辑到可检索的 lag，p95） | ≤ 60s |
| 检索延迟（不含生成，p95） | ≤ 800ms |
| 首字延迟（内网典型模型） | ≤ 3s（依赖部署模型） |
| 权限越权命中 | **0**（红线，必须） |

**功能验收**：
- 提问可流式返回、带可点击引用、跳转并高亮命中段落；
- 越权空间内容永不出现在答案或引用中；
- 页面编辑后一段时间内答案能反映新内容；
- 换 embedding 模型后可一键重建索引；
- `AI_ENABLED=false` 时无任何 AI 入口与外部调用。

---

## 12. 依赖与风险

| 项 | 说明 / 缓解 |
|----|------|
| 依赖：内网可用的 LLM + Embedding 端点 | 部署前置条件；提供健康检查与降级 |
| 依赖：bge-m3 / LLM 端点为 OpenAI 兼容（或加适配） | 非标准接口在抽象层适配，不新增服务 |
| 风险：**权限泄漏** | 检索层强制过滤 + 专项测试，作为发布阻断项 |
| 风险：中文检索质量 | bge-m3 + 混合检索 + 切块调参；用反馈数据迭代 |
| 风险：幻觉 | 强制引用、无据不答、答案可追溯原文 |
| 风险：无 ANN 的检索规模上限 | 靠 FTS 候选裁剪 + 内存向量缓存维持 CPU 亚秒级；体量增长到数十万 chunk 以上再评估 pgvector（需改 PG 镜像） |

---

## 13. 决策与开放问题

**已确认（本轮）**：

1. 流式传输：**SSE**（§6.5）。
2. 向量方案：**不引入 pgvector、不改 PG 镜像**；embedding 存 `bytea`，检索为「FTS 候选 + 内存暴力余弦」，**CPU 可跑**（§6.2 / §7.2）。
3. 模型：复用内网**现有 LLM** 与 **bge-m3（1024 维）**，**不新增容器 / 硬件**（§7.3）。
4. MCP：**复用同一检索服务**，新增语义检索 tool（§8）。
5. 附件 / 图片：**暂不索引**（§4.2）。

**仍待定（已给默认值，可推翻）**：

- 会话历史留存期限：默认 30 天、可配置；审计日志默认开启。
- 模型 / 开关配置：MVP 走**环境变量**即可；是否需要工作区级配置界面，留待 P1 评估。

---

## 14. 里程碑（建议）

1. **M1 地基**：模型接入抽象层 + `page_chunks` 迁移（`bytea`，无 PG 扩展）+ 索引管道（含增量 / 回填）。
2. **M2 检索**：权限过滤 + 向量 + 混合融合 + 检索评测集。
3. **M3 问答**：流式生成 + 引用 + 前端面板 + 反馈。
4. **M4 加固**：权限越权测试、降级、可观测、性能调优与灰度开关。

（P1 编辑器内助手、P2 代码转文档在 P0 稳定后按 §9 展开。）
