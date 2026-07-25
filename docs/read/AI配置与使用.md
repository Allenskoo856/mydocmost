# Docmost AI 配置与使用文档

> 适用项目：mydocmost（内网 / 离线定制 Fork）
> 功能：知识库 AI 问答（RAG，带出处引用）
> 更新日期：2026-07-25

---

## 1. 功能概述

启用后，Docmost 会把页面正文自动向量化，用户可以用**自然语言提问**，系统在**有权限的范围内**检索相关内容，交给大模型作答，并给出**可点击跳转的出处引用**。

设计要点（对内网 / 离线部署友好）：

- **零新增容器 / 硬件**：不使用 pgvector、不改 PostgreSQL 镜像；向量存普通 `real[]` 列，相似度在应用层计算（CPU 可跑）。
- **复用内网现有模型**：LLM 与 Embedding 走可配置的 **OpenAI 兼容端点**（如内部 AI 网关 / vLLM / Ollama），不触外网。
- **权限安全**：检索严格限定在提问用户可读的空间（Space），越权内容不会进入答案或引用。
- **有据可依**：答案基于检索到的原文；检索不到时明确说明「未找到」，不编造。

---

## 2. 前置条件

- 一个内网可访问的 **OpenAI 兼容** LLM 端点（实现 `/v1/chat/completions`）。
- 一个内网可访问的 **Embedding** 端点（实现 `/v1/embeddings`），推荐 **bge-m3**（1024 维，中文强）。
- PostgreSQL 正常运行（无需任何扩展）。

> 若 LLM / Embedding 服务不是标准 OpenAI 接口（如裸 TEI / Xinference），需在其前面加一层 OpenAI 兼容适配，或使用其自带的 OpenAI 兼容模式。

---

## 3. 环境变量配置

在 Docmost 服务端 `.env` 中加入（示例为内网 OpenAI 兼容网关）：

```bash
# 驱动：openai | gemini | ollama。内网 OpenAI 兼容端点用 openai
AI_DRIVER=openai

# 模型
AI_EMBEDDING_MODEL=bge-m3
AI_COMPLETION_MODEL=your-internal-llm
AI_EMBEDDING_DIMENSION=1024        # 必须与 Embedding 模型一致；bge-m3=1024

# OpenAI 兼容端点（URL 需包含 /v1）
OPENAI_API_URL=http://your-internal-ai-gateway/v1
OPENAI_API_KEY=internal-token      # 无鉴权时可留空

# 若使用 Ollama（可选，二选一）
# AI_DRIVER=ollama
# OLLAMA_API_URL=http://your-ollama-server:11434
```

### 3.1 变量说明

| 变量 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `AI_DRIVER` | 是 | 空 | `openai` / `gemini` / `ollama`；留空即关闭 AI |
| `AI_EMBEDDING_MODEL` | 是 | 空 | 向量模型名，如 `bge-m3` |
| `AI_COMPLETION_MODEL` | 是 | 空 | 对话模型名（内网 LLM） |
| `AI_EMBEDDING_DIMENSION` | 是 | 空 | 向量维度：`768`/`1024`/`1536`/`2000`，须与模型一致 |
| `OPENAI_API_URL` | openai 必填 | 空 | OpenAI 兼容 base URL，**含 `/v1`** |
| `OPENAI_API_KEY` | openai | 空 | Bearer Token，无鉴权可空 |
| `OLLAMA_API_URL` | ollama | `http://localhost:11434` | Ollama 地址（内部会追加 `/v1`） |

### 3.2 检索 / 切块调优（均有默认值，可不填）

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `AI_RAG_TOP_K` | `8` | 最终喂给 LLM 的片段数 |
| `AI_VECTOR_CANDIDATE_LIMIT` | `300` | 暴力精排的候选集大小上限 |
| `AI_CHUNK_SIZE` | `1600` | 切块字符数 |
| `AI_CHUNK_OVERLAP` | `200` | 切块重叠字符数 |
| `AI_MAX_CONTEXT_CHARS` | `8000` | 拼给 LLM 的上下文字符预算 |
| `AI_REQUEST_TIMEOUT_MS` | `60000` | 单次模型请求超时（毫秒） |

> ⚠️ 修改 `AI_EMBEDDING_MODEL` 或 `AI_EMBEDDING_DIMENSION` 后需**重建索引**（内容哈希包含模型名，编辑页面会自动重嵌）。

---

## 4. 启用步骤

1. 配置上面的环境变量。
2. 应用数据库迁移（创建 `page_embeddings` 表）：
   - **生产**：容器启动时自动迁移；
   - **开发**：`pnpm --filter ./apps/server run migration:latest`。
3. 重启服务端（`pnpm start` 或重启容器）。
4. 生成索引（见第 5 节）。
5. 前端刷新后，页头出现 🤖 按钮、`Cmd/Ctrl+K` 出现「Ask AI」命令，即表示已启用（前端通过 `window.CONFIG.AI_ENABLED` 判断）。

---

## 5. 索引说明

答案质量依赖 `page_embeddings` 里的向量。索引由后台队列（`AI_QUEUE`）异步处理，**不影响编辑 / 阅读主线程**。

- **增量索引（自动）**：任何页面的新建 / 编辑保存 / 恢复 / 移动都会自动重嵌；删除 / 回收站会清除其向量。内容未变化（哈希一致）时自动跳过。
- **全量回填（存量内容）**：启用 AI 前已存在的页面，可通过以下任一方式建立索引：
  - **推荐**：进入 **设置 → 工作区 → General**，在「AI 知识索引」卡片点击 **「重建索引」**（管理员可见），后台一键回填全工作区；卡片会显示「已索引 X / Y 页」进度。
  - 编辑并保存某页面（仅触发该页增量索引）；或
  - 在工作区设置中开启「AI 搜索」，同样触发全量回填。
- **CPU 降级**：检索链路（候选召回 + 暴力余弦）本身即 CPU 可跑；Embedding 也可指向 bge-m3 的 CPU 实例作为降级（更慢但不阻断）。

---

## 6. 使用方式

### 6.1 打开问答面板

- **页头 🤖 按钮**：在页面右上角，点击直接打开右侧「Ask AI」面板。
- **命令面板**：按 `Cmd/Ctrl+K`，输入「Ask AI / 提问」并回车。

### 6.2 提问

1. 选择**作用域**：当前页面 / 当前空间 / 整个工作区（默认取最贴近当前位置的作用域）。
2. 输入问题，回车发送（`Shift+Enter` 换行）。
3. 答案**流式**逐字返回；下方「来源」列出引用页面。
4. 点击引用卡片直接**跳转到原文页面**。

> 作用域越大召回越全，但也可能引入更多噪声；定位具体问题时建议先用「当前空间」。

### 6.3 结果说明

- 答案中的 `[1] [2]` 对应「来源」里的编号页面。
- 若返回「在你有权限的范围内未找到相关内容」，通常是：该内容尚未建立索引、或不在你有权限的空间、或问题与文档无关。

---

## 7. 面向 Agent 的语义检索（MCP）

除人机问答外，同一套检索能力也通过 MCP 暴露给外部 Agent：新增工具 **`semantic_search`**（语义检索页面片段）。配置与使用见 [`MCP接入指南.md`](./MCP接入指南.md)。

---

## 8. 安全与隐私

- **权限过滤**：检索按「用户可读空间」强制过滤，越权内容永不进入上下文（MCP 侧按 Agent 用户的工作区范围）。
- **离线**：所有模型调用仅指向你配置的内网端点，不产生任何外网请求。
- **提示注入防护**：页面内容作为「数据」注入，系统提示明确不执行其中的指令。
- **不提交密钥**：`.env` 中的 `OPENAI_API_KEY` 等不要提交到 Git。

---

## 9. 排障

| 现象 | 排查 |
| --- | --- |
| 页头无 🤖 按钮 / 无「Ask AI」命令 | `AI_DRIVER` 是否配置；前端是否刷新；生产是否重新注入 `window.CONFIG` |
| 提问报错 / 无响应 | `OPENAI_API_URL` 是否含 `/v1`、能否从服务器访问；`AI_COMPLETION_MODEL` 名称是否正确；看服务端日志 |
| 有答案但总是「未找到」 | 是否已建立索引（编辑一次页面或触发回填）；`page_embeddings` 是否有数据；作用域是否选对 |
| 维度报错 / 向量异常 | `AI_EMBEDDING_DIMENSION` 与模型实际维度是否一致；换模型后是否重建索引 |
| 子目录部署下 SSE 不流式 | Nginx 对 `/api/ai/ask` 需 `proxy_buffering off` 并拉长 `proxy_read_timeout`（与 `/collab` 一致） |
| 流式响应被缓冲 | 检查反向代理是否透传 `X-Accel-Buffering: no` |

---

## 10. 已知限制

- 无 ANN 索引，检索规模上限约在数十万 chunk 量级；更大规模再评估引入 pgvector（届时需改 PG 镜像）。
- 附件 / 图片内容暂不索引。
- 暂未持久化会话历史与「有帮助/无帮助」反馈（后续版本）。
- 阅读模式下的问答不含实时协同更新，最新内容以索引为准。
