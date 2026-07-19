# 大文档前端性能优化设计文档

## 背景

在 `http://192.168.0.21:9227/evadoc` 实测中，大文档（`PERF-大文档-5000节-20260718`，约 5000 个二级标题，`contentSize` 4,830,077，渲染后 HTML 约 2.79 MB）存在以下性能问题：

1. 打开时标题 30s+ 才稳定（已通过“大文档强制默认阅读模式”补丁初步缓解）。
2. 大文档滚动明显卡顿。
3. 从大文档切换到小文档明显卡顿。

## 目标

将大文档体验优化到“正常/可用”阶段：

| 指标 | 当前 | 目标 |
|---|---|---|
| 大文档标题稳定 | ~34s | ≤ 3s |
| 大文档滚动 | 明显卡顿，长任务多 | 无 >100ms 长任务，平均帧时 ≤ 20ms |
| 大→小切换 | 明显卡顿 | ≤ 1.5s |
| 小→大切换 | 较慢 | ≤ 3s |
| 内存 | 切换后堆内存持续增长 | 切换后回落，无持续增长 |

## 根因分析

### 滚动卡顿

1. **TOC IntersectionObserver 观察全部标题**：`table-of-contents.tsx` 对大文档的 ~5000 个 heading 全部 `observe()`，滚动时高频触发 `setActiveElement()`，导致 TOC 组件重渲染。
2. **一次性注入 2.79 MB HTML**：无虚拟化/分块渲染，DOM 节点数过大。
3. **`content-visibility: auto` fallback 高度 48px 过小**：真实块高远大于 48px，首次滚动经过时元素“展开”，滚动条跳动。
4. **服务端语法高亮增加 DOM 元素**：大量 `<span class="hljs-*">`。
5. **图片无固定高度**：Excalidraw/Drawio 图片滚动到视口才解码，导致布局偏移。

### 切换卡顿

1. **Editor/Yjs 同步销毁阻塞主线程**：`PageEditor` unmount 时 Tiptap 的 `editor.destroy()` 同步遍历所有节点视图。
2. **`Y.Doc` 未显式 destroy**：cleanup 只 destroy providers。
3. **全局 editor atom 未重置**：`pageEditorAtom`、`titleEditorAtom` 在 unmount 后仍持有旧 editor 引用。
4. **`key={page.id}` 强制整树 remount**：每次切换都走完整 teardown。
5. **`TitleEditor` 在 `pageId` 变化时同步 `saveTitle()`**。

## 方案

采用“先 cleanup + TOC 优化快速见效，再分块渲染兜底”的综合方案。

### 第一阶段：Cleanup 与 TOC 优化

1. **限制 TOC IntersectionObserver 目标数量**
   - 当 heading 数量超过阈值（如 100）时，改用基于滚动位置的轻量计算：只计算视口内最近的 1-2 个 heading。
   - 保留原 Observer 行为用于小文档。

2. **优化 `content-visibility` intrinsic size**
   - 将 `.page-readonly-snapshot > *` 的 `contain-intrinsic-size: auto 48px` 调整为 `auto 200px`，减少首次滚动跳动。

3. **修复 `PageEditor` cleanup**
   - unmount 时显式调用 `ydoc.destroy()`。
   - unmount 时重置 `pageEditorAtom` 为 `null`。

4. **修复 `TitleEditor` cleanup**
   - 添加 unmount effect 重置 `titleEditorAtom` 为 `null`。
   - 将 `saveTitle()` 从 `pageId` 变化 effect 改为真正的 unmount-only effect，或延迟执行。

5. **延迟 editor/ydoc 销毁**
   - 在 `PageEditor` unmount 时，把 `editor.destroy()` 和 `ydoc.destroy()` 放入 `requestIdleCallback` / `setTimeout`，避免阻塞导航渲染。

### 第二阶段：只读快照分块渲染

1. **按顶层块切分 `renderedContent`**
   - 在 `PageContentSnapshot` 中，把 HTML 字符串按一级块（heading、paragraph、code block 等顶层节点）切分成 chunks。

2. **首屏渲染 + 懒加载**
   - 首屏渲染前 N 个 chunk（如前 50 个顶层块，约 2-3 屏）。
   - 剩余 chunk 用 `IntersectionObserver` 在接近视口时渲染。
   - 已渲染的 chunk 不再卸载，避免反复布局。

3. **锚点定位兼容**
   - 分块渲染后，`window.location.hash` 对应的 heading 可能尚未渲染。需要在懒加载时检查目标 id，优先渲染包含该 id 的 chunk。

4. **搜索/查找兼容**
   - 分块渲染不影响 `Ctrl+F` 浏览器原生搜索，因为内容最终都会渲染；仅首屏未渲染时搜索结果可能不全，但这是可接受的渐进增强。

## 边界与风险

- **编辑模式**：分块渲染仅作用于只读快照；点击“编辑”后进入完整 `PageEditor`，仍一次性加载全部内容。这是用户主动行为，可接受。
- **打印/导出**：打印时可能只渲染了部分 chunk；如需完整打印，可在打印前强制渲染全部 chunk。
- **无障碍**：懒加载内容对屏幕阅读器的影响需验证；建议为未加载 chunk 提供 aria-busy 或占位。

## 测试方案

1. 浏览器手工/Playwright 测试：
   - 大文档首屏打开时间。
   - 大文档滚动 Performance 面板长任务数量。
   - 大→小、小→大切换时间。
   - 连续切换 5 次后的内存趋势。
2. 单元测试：
   - 分块渲染工具函数（如果抽出）。
3. 回归测试：
   - 小文档行为不变。
   - TOC 锚点跳转正常。
   - 编辑按钮、评论点击正常。

## 验收标准

- `pnpm client:build` 通过。
- 修改文件 eslint / prettier 通过。
- 大文档滚动无 >100ms 长任务。
- 大→小切换 ≤ 1.5s。
- 小→大切换 ≤ 3s。
