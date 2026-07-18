# 工作上下文:Docmost 大文档性能优化(弱 CPU / 国产机)

> 本文档用于跨对话交接。新对话开始时请先读本文件,再决定下一步。
> 最近更新:2026-07-18,当前分支 `feature_nonetwork`,HEAD = `85d4daa`(已推送 origin),另有一轮性能优化保留在工作区、尚未提交。

## 1. 原始问题

- 项目:`mydocmost`(Docmost v0.24.1 内网定制 Fork,详见根 `AGENTS.md`)。
- 症状:文档文字量大时,左侧目录树切换文档长时间卡顿;Linux + 国产 CPU(龙芯/飞腾等)+ Chrome 最严重,Windows + Intel 较轻。
- 根因结论(已经代码核实):所有热点都在浏览器主线程,且随文档大小线性/超线性增长。国产 CPU 单核弱 2-4 倍,Linux Chrome 在国产 GPU 上常走软件光栅化,进一步放大。

### 核心根因链(证据)

1. 切换页面 `key={page.id}` 整棵重挂载(`apps/client/src/pages/page/page.tsx:66`),同一文档被完整"解析+渲染"2~3 次:
   - REST content → 一次性静态占位编辑器全量渲染(`page-editor.tsx` showStatic 分支),WS 连上即销毁;
   - IndexedDB 缓存命中 → y-prosemirror 全量 replace 重渲染;
   - 远端 Hocuspocus 同步 → 再一次全量 replace。
2. 协同编辑器实例曾因 `remoteProvider` undefined→defined 建两次。
3. ProseMirror 全文一次性渲染,无任何虚拟化。
4. 常驻 O(全文) 开销:原 `onUpdate` 每次事务 `editor.getJSON()` 未 debounce;Heading 装饰插件每次状态变化(含光标移动)`doc.descendants` 全扫(`packages/editor-ext/src/lib/heading/heading.ts`);TOC 每次 update `$nodes("heading")` 全扫(`table-of-contents.tsx`);lowlight 对全文代码块 highlight.js 同步高亮(init + 协同同步各一次);KaTeX/mermaid 每节点挂载即同步渲染。
5. 侧边栏树:`data.filter()` 每次渲染新数组引用使 react-arborist memo 失效;每行挂 EmojiPicker + Menu + 4 个 modal。
6. 内容三通道加载:REST 全量 + IndexedDB + collab WS。
7. 已排除:CharacterCount 是惰性计算,非热点;react-arborist 补丁仅删 Backspace 快捷键,与性能无关。

## 2. 已完成的工作

### A 级止血修复 —— 提交 `82e4ce7`(用户自行提交,消息误写为 "docs:相关的内容及信息",内容确为性能修复)

- A1 `page-editor.tsx`:`onUpdate` 的 `getJSON()` 移入 3000ms debounce(加 `isDestroyed` 保护)。
- A2 `heading.ts`(editor-ext):装饰改 Plugin state 缓存,仅 `docChanged` 重扫(PluginKey: `headingLinkDecorations`)。
- A3 `table-of-contents.tsx`:TOC 全扫加 300ms debounce。
- A4 `page-editor.tsx`:JSON > ~300KB 大文档跳过静态占位编辑器,显示骨架屏直等协同;8s 未连上自动回退静态渲染。
- A5 `page-editor.tsx`:providers 改首渲染同步创建(`useState` 惰性初始化),协同编辑器只实例化一次。
- A6 `space-tree.tsx`:树数据过滤 `useMemo`;每行 4 个 modal 改为打开时才挂载。

### B7 阅读模式静态渲染 + B8 视口懒渲染 —— 提交 `85d4daa`

- 新增 `apps/client/src/features/editor/hooks/use-lazy-render.ts`(Mantine `useIntersection`,rootMargin 600px,可见后永久保持)。
- B7:`full-editor.tsx` 双模式分支 —— 无编辑权限 / 偏好"阅读"且未点编辑 → `ReadonlyPageEditor` 静态渲染(零 Yjs/WS/IndexedDB);页头"编辑"按钮(`page-header.tsx`)经 `pageForceEditAtom` 一键升级为协同;`page-editor.tsx`/`title-editor.tsx` 的 `setEditable` 支持 forceEdit 覆盖;评论/侧栏重置 effect 上移至 FullEditor;`readonly-page-editor.tsx` 支持 children 并写入 `pageEditorAtom`(TOC/字数/评论可用);`history-list.tsx` 阅读模式隐藏"恢复"按钮。
- B8:`math-block.tsx` / `math-inline.tsx` / `mermaid-view.tsx` / `embed-view.tsx` 进入视口才渲染(KaTeX/mermaid/iframe);drawio/excalidraw 经核实挂载仅静态图,未改。
- 生效条件:**无编辑权限用户自动生效**;有权限用户需把"默认页面状态"偏好设为"阅读"才走静态路径(默认可在 `page-state-pref.tsx` 调整)。

### B9-B11 大文档代码块与加载切换优化 —— 当前工作区,尚未提交

- B9:新增统一的大文档判断(`apps/client/src/features/editor/utils/large-document.ts`,ProseMirror JSON > 300KB);阅读、页面历史、静态回退和协同编辑路径统一使用大文档扩展集。
- B9:大文档的 `CustomCodeBlock` 保留 schema、React NodeView、语言列表和 VS Code 粘贴处理,仅移除 lowlight decoration 插件。避免初始化/全文协同同步时逐代码块同步高亮,并消除 lowlight 在每次 `docChanged` 时对新旧全文各扫描一次的开销。
- B10:`code-block-view.tsx` 只有 Mermaid 代码块监听 `selectionUpdate`;普通代码块不再在每次光标移动时全部执行 `getPos()` 和选区判断。
- B11:`page-editor.tsx` 的静态占位/骨架切换从"WebSocket 已连接"改为"IndexedDB 与远端 Yjs 均已同步";同步卡住时大文档仍在 8 秒后回退 REST 静态内容,减少骨架消失后的空白/闪烁。

### 已知取舍

- 阅读模式无实时协同更新/在线光标,需刷新获取最新内容。
- 阅读模式下不再拦截 Ctrl+F,浏览器原生查找可用(页内搜索替换对话框仅编辑模式挂载)。

## 3. 验证状态

- ✅ `pnpm editor-ext:build`、`pnpm client:build`(tsc + Vite)通过;改动文件 Prettier/ESLint 通过。
- ✅ B9-B11:改动文件 ESLint/Prettier 通过;`NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm client:build` 通过(含 editor-ext build、客户端 tsc、Vite production build)。本机沙箱不允许 Nx daemon/plugin worker 创建 Unix socket,需使用上述两个环境变量,不是代码错误。
- ❌ 未做真机验证。待办(国产 CPU 机器):
  1. 无权限小号打开 10 万字文档应秒开;
  2. 编辑账号设"默认页面状态=阅读"后切换大文档,点页头"编辑"确认升级后可编辑、标题可改、协同正常;
  3. 大量公式/mermaid 文档快速滚动,确认进视口渲染正常、无占位残留;
  4. 可用 Chrome DevTools Performance 录制切换过程对比(Main 线程 Evaluate Script vs Layout 占比)。
- 注意:推送 `feature_nonetwork` 会触发 `.github/workflows/docker-build.yml` 构建并推 DockerHub 镜像。

## 4. 剩余可选工作(按优先级)

1. **先做真机 Performance 对比**:重点量化 B9 后 `lowlight`/`highlightAuto` 是否从大文档调用栈消失,以及首次正文可见时间、最长 Long Task、INP。
2. **保留 `IndexeddbPersistence`,暂不自动关闭**:关闭确实可少一次本地更新重放,但会失去刷新/崩溃后的未同步草稿恢复。只有在真机录制证明 IndexedDB 重放仍是主要瓶颈后,才考虑做工作区开关或仅对超大文档提示用户选择,不建议静默禁用。
3. **阅读模式试验 `content-visibility:auto`**:可降低离屏块的 layout/paint,但需要验证目录跳转、浏览器查找、评论定位、滚动高度稳定性。不要直接用于可编辑 ProseMirror,其选区坐标/IME/拖拽依赖完整布局。
4. **长文档模式**(C 级):产品层引导按章节拆分页;超大文档可继续关闭非必要只读插件/重 NodeView。ProseMirror 编辑态的真正虚拟化风险高,不作为近期方案。
5. **部署侧调优**(C 级):国产 Linux 机检查 `chrome://gpu`,GPU 被黑名单时用 `--enable-gpu-rasterization --ignore-gpu-blocklist` 启动 Chrome 验证。
6. 服务端隐患(非本次卡顿主因):`apps/server/src/collaboration/extensions/persistence.extension.ts` 的 `onStoreDocument` 每次全量 `fromYdoc` + `Y.encodeStateAsUpdate`,多人编辑大文档时是服务端 CPU 瓶颈,可后续优化为增量。

## 5. 常用命令

```bash
pnpm dev                    # 前后端并行开发
pnpm client:build           # 前端构建(含 tsc 类型检查)
pnpm editor-ext:build       # 改 packages/editor-ext 后必跑(服务端用 dist)
pnpm server:build           # 后端构建
```

修改前端后至少跑 `pnpm client:build` 验证;改动文件跑 `npx prettier --write <files>` 和 `npx eslint <files>`。
