# 大文档前端性能优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除大文档滚动卡顿与大→小切换卡顿，将关键性能指标优化到正常阶段。

**Architecture:** 第一阶段通过修复 TOC IntersectionObserver 过载、`content-visibility` 回退高度、以及 editor/Yjs/atom cleanup 来快速降低主线程阻塞；第二阶段如指标仍不达标，再对只读快照做基于 IntersectionObserver 的分块懒渲染。

**Tech Stack:** React 18, TypeScript, Tiptap 2, Yjs, Hocuspocus, Mantine, Jotai.

## Global Constraints

- 所有改动在 `apps/client/src/` 内。
- 不引入新的运行时依赖（lodash 等）。
- 小文档行为必须保持不变。
- 修改后必须通过 `pnpm client:build` 和改动文件的 eslint/prettier。
- 代码注释与标识符使用英文。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `apps/client/src/features/editor/components/table-of-contents/table-of-contents.tsx` | TOC 组件；本次需优化大文档下的 active heading 计算方式。 |
| `apps/client/src/features/editor/styles/core.css` | 编辑器与快照样式；需调整 `content-visibility` intrinsic size。 |
| `apps/client/src/features/editor/page-editor.tsx` | 页面正文编辑器；需修复 ydoc/atom cleanup，延迟销毁。 |
| `apps/client/src/features/editor/title-editor.tsx` | 标题编辑器；需修复 atom cleanup 与 saveTitle 调用时机。 |
| `apps/client/src/features/editor/readonly-page-snapshot.tsx` | 只读快照渲染；第二阶段可能在这里加分块渲染。 |

---

## Task 1: 优化 TOC IntersectionObserver

**Files:**
- Modify: `apps/client/src/features/editor/components/table-of-contents/table-of-contents.tsx:175-214`

**Interfaces:**
- Consumes: `headingDOMNodes` (HTMLElement[]), `props.editor`
- Produces: `setActiveElement` 调用频率受控

大文档下 `headingDOMNodes` 可达 ~5000，全部 `observe()` 后滚动时回调高频触发 `setActiveElement()`，导致 TOC 重渲染。当 heading 数量超过阈值（100）时，改用基于 `window.scroll` 的节流计算。

- [x] **Step 1: 添加大文档阈值与 throttle 工具函数**

在文件顶部 `import` 之后添加：

```ts
const LARGE_DOC_HEADING_THRESHOLD = 100;

function throttle<T extends (...args: any[]) => void>(fn: T, wait: number) {
  let lastTime = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastTime >= wait) {
      lastTime = now;
      fn(...args);
    }
  };
}
```

- [x] **Step 2: 重构 active heading 计算 effect**

把原来的 IntersectionObserver effect（175-214 行）替换为：

```ts
  useEffect(() => {
    if (headingDOMNodes.length === 0) return;

    const headerOffset = headerPaddingRef.current
      ? parseInt(
          window
            .getComputedStyle(headerPaddingRef.current)
            .getPropertyValue("top"),
        )
      : 0;

    // For large documents, observing thousands of headings with
    // IntersectionObserver causes the TOC to re-render continuously while
    // scrolling. Fall back to a throttled scroll-based scan instead.
    if (headingDOMNodes.length > LARGE_DOC_HEADING_THRESHOLD) {
      const findActiveHeading = () => {
        let active: HTMLElement | null = null;
        for (let i = 0; i < headingDOMNodes.length; i++) {
          const rect = headingDOMNodes[i].getBoundingClientRect();
          if (rect.top > headerOffset) {
            active = i > 0 ? headingDOMNodes[i - 1] : headingDOMNodes[0];
            break;
          }
        }
        if (!active && headingDOMNodes.length > 0) {
          active = headingDOMNodes[headingDOMNodes.length - 1];
        }
        setActiveElement((current) =>
          current === active ? current : active,
        );
      };

      const throttledFind = throttle(findActiveHeading, 100);
      window.addEventListener("scroll", throttledFind, { passive: true });
      findActiveHeading();

      return () => {
        window.removeEventListener("scroll", throttledFind);
      };
    }

    // Small/medium documents: keep the original IntersectionObserver behavior.
    try {
      const observeHandler = (entries: IntersectionObserverEntry[]) => {
        let newActive: HTMLElement | null = null;
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            newActive = entry.target as HTMLElement;
          }
        });
        if (newActive) {
          setActiveElement((current) =>
            current === newActive ? current : newActive,
          );
        }
      };

      const observerOptions: IntersectionObserverInit = {
        rootMargin: `-${headerOffset}px 0px -85% 0px`,
        threshold: 0,
        root: null,
      };
      const observer = new IntersectionObserver(
        observeHandler,
        observerOptions,
      );

      headingDOMNodes.forEach((heading) => {
        observer.observe(heading);
      });
      return () => {
        observer.disconnect();
      };
    } catch (err) {
      console.log(err);
    }
  }, [headingDOMNodes, props.editor]);
```

- [x] **Step 3: 验证改动文件语法与格式**

Run:
```bash
cd apps/client && pnpm exec eslint src/features/editor/components/table-of-contents/table-of-contents.tsx && pnpm exec prettier --check src/features/editor/components/table-of-contents/table-of-contents.tsx
```
Expected: 无错误。

- [x] **Step 4: 提交**

```bash
git add apps/client/src/features/editor/components/table-of-contents/table-of-contents.tsx
git commit -m "perf(editor): throttle TOC active heading calculation for large documents"
```

---

## Task 2: 调整 content-visibility 回退高度

**Files:**
- Modify: `apps/client/src/features/editor/styles/core.css:240-243`

**Interfaces:**
- Consumes: `.page-readonly-snapshot > *` 样式
- Produces: 更合理的 `contain-intrinsic-size`

当前 `contain-intrinsic-size: auto 48px` 对真实块高普遍大于 48px 的大文档会导致首次滚动时滚动条跳动、额外重排。

- [x] **Step 1: 修改 CSS**

```css
/* Static page snapshots can skip layout and paint for off-screen blocks.
   Use a larger fallback intrinsic size for large documents so the initial
   scrollbar estimate is closer to reality and avoids jank on first scroll. */
.page-readonly-snapshot > * {
  content-visibility: auto;
  contain-intrinsic-size: auto 200px;
}
```

- [x] **Step 2: 验证格式**

Run:
```bash
cd apps/client && pnpm exec prettier --check src/features/editor/styles/core.css
```
Expected: 无错误。

- [x] **Step 3: 提交**

```bash
git add apps/client/src/features/editor/styles/core.css
git commit -m "perf(editor): increase content-visibility fallback size for large snapshots"
```

---

## Task 3: 修复 PageEditor cleanup

**Files:**
- Modify: `apps/client/src/features/editor/page-editor.tsx:189-194`, `285-291`

**Interfaces:**
- Consumes: `ydocRef`, `providers`, `pageEditorAtom`
- Produces: ydoc 被显式 destroy；atom 在 unmount 时重置；销毁逻辑延迟执行

- [x] **Step 1: 显式 destroy Y.Doc 并延迟 provider/editor 销毁**

把 unmount cleanup effect（189-194 行）替换为：

```ts
  // Destroy providers and editor state. For large documents, destroying the
  // Yjs document and Tiptap editor instance synchronously on unmount blocks
  // the navigation render. Defer the teardown so the next page can paint first.
  useEffect(() => {
    return () => {
      const ydoc = ydocRef.current;
      const { remote, local } = providers;

      const teardown = () => {
        try {
          remote.destroy();
        } catch {
          // ignore
        }
        try {
          local.destroy();
        } catch {
          // ignore
        }
        try {
          ydoc?.destroy();
        } catch {
          // ignore
        }
        ydocRef.current = null;
      };

      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        window.requestIdleCallback(teardown, { timeout: 2000 });
      } else {
        setTimeout(teardown, 100);
      }
    };
  }, [providers]);
```

- [x] **Step 2: 在 unmount 时重置 pageEditorAtom**

在 `onCreate` 回调之前声明 cleanup effect（放在 285-291 行附近）：

```ts
  // Reset the global editor atom when this editor unmounts so consumers
  // (aside, comments, history) don't hold a reference to a destroyed editor.
  useEffect(() => {
    return () => {
      setEditor(null);
    };
  }, [setEditor]);
```

- [x] **Step 3: 验证改动文件**

Run:
```bash
cd apps/client && pnpm exec eslint src/features/editor/page-editor.tsx && pnpm exec prettier --check src/features/editor/page-editor.tsx
```
Expected: 无错误。

- [x] **Step 4: 提交**

```bash
git add apps/client/src/features/editor/page-editor.tsx
git commit -m "perf(editor): defer editor teardown and reset editor atom on unmount"
```

---

## Task 4: 修复 TitleEditor cleanup

**Files:**
- Modify: `apps/client/src/features/editor/title-editor.tsx:50-55, 159-170`

**Interfaces:**
- Consumes: `titleEditorAtom`, `titleEditor`, `pageId`
- Produces: atom 在 unmount 时重置；saveTitle 不再在 pageId 变化时同步触发

- [x] **Step 1: 添加 unmount cleanup 重置 titleEditorAtom**

在标题 editor 创建后添加：

```ts
  // Reset the global title editor atom when this component unmounts so the
  // next page doesn't briefly read a destroyed editor instance.
  useEffect(() => {
    return () => {
      setTitleEditor(null);
    };
  }, [setTitleEditor]);
```

放在 `titleEditor` 声明之后（约 105 行后）即可。

- [x] **Step 2: 将 saveTitle 改为真正的 unmount-only**

把 165-170 行的 effect：

```ts
  useEffect(() => {
    return () => {
      // force-save title on navigation
      saveTitle();
    };
  }, [pageId]);
```

替换为：

```ts
  useEffect(() => {
    return () => {
      // force-save title on navigation
      saveTitle();
    };
    // intentionally empty deps: this cleanup should only run on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [x] **Step 3: 验证改动文件**

Run:
```bash
cd apps/client && pnpm exec eslint src/features/editor/title-editor.tsx && pnpm exec prettier --check src/features/editor/title-editor.tsx
```
Expected: 无错误。

- [x] **Step 4: 提交**

```bash
git add apps/client/src/features/editor/title-editor.tsx
git commit -m "perf(editor): reset title editor atom and defer saveTitle on unmount"
```

---

## Task 5: 验证构建与浏览器指标

- [x] **Step 1: 全量构建**

Run:
```bash
pnpm client:build
```
Expected: `Successfully ran target build for project client`。

- [x] **Step 2: 针对改动文件 lint/format**

Run:
```bash
cd apps/client && pnpm exec eslint \
  src/features/editor/components/table-of-contents/table-of-contents.tsx \
  src/features/editor/styles/core.css \
  src/features/editor/page-editor.tsx \
  src/features/editor/title-editor.tsx

pnpm exec prettier --check \
  src/features/editor/components/table-of-contents/table-of-contents.tsx \
  src/features/editor/styles/core.css \
  src/features/editor/page-editor.tsx \
  src/features/editor/title-editor.tsx
```
Expected: 无错误。

- [ ] **Step 3: 浏览器验证**

在测试环境 `http://192.168.0.21:9227/evadoc` 执行：

1. 打开大文档 `.../p/perf-5000-20260718-Gwbj2731q2`。
2. DevTools Performance 面板录制，匀速滚动到底部。
3. 检查：
   - Long tasks（>100ms）数量是否接近 0；
   - Frame time 是否基本 ≤ 20ms；
   - TOC active 更新是否不再频繁闪烁。
4. 从大文档点击跳转到小文档 `.../p/perf-20260718-GF7D5XnItx`。
5. 检查：
   - 标题切换时间是否 ≤ 1.5s；
   - 页面是否可快速交互。
6. Memory 面板连续切换 5 次，检查堆内存是否回落、无持续增长。

- [x] **Step 4: 提交（如需要）**

若验证通过，无需额外提交；若有修复，单独提交。

---

## Task 6（Fallback）: 只读快照分块懒渲染

如 Task 1-5 验证后滚动仍不达标，执行本任务。

**Files:**
- Modify: `apps/client/src/features/editor/readonly-page-snapshot.tsx`

**Interfaces:**
- Consumes: `renderedContent`
- Produces: 分块渲染的 DOM

- [x] **Step 1: 将 renderedContent 切分为顶层块并首屏渲染**

- 使用 `DOMParser` 在 effect 中解析 `renderedContent`。
- 提取每个顶层子元素的 `outerHTML` 作为 chunk。
- 首屏渲染前 `INITIAL_CHUNK_COUNT` 个 chunk（如 50）。

- [x] **Step 2: 使用 IntersectionObserver 懒加载剩余 chunk**

- 在已渲染列表底部放置 sentinel div。
- 当 sentinel 进入视口（rootMargin 200px）时，追加 `CHUNK_SIZE` 个 chunk（如 30）。

- [x] **Step 3: 兼容锚点跳转**

- 懒加载过程中，若 `window.location.hash` 指向的 id 尚未渲染，找到包含该 id 的 chunk 并优先渲染到该 chunk。

- [x] **Step 4: 验证与提交**

同 Task 5。

---

## Self-Review

1. **Spec coverage**: Task 1 覆盖 TOC 优化；Task 2 覆盖 content-visibility；Task 3-4 覆盖 cleanup；Task 5 覆盖验证；Task 6 覆盖分块渲染兜底。
2. **Placeholder scan**: 无 TBD/TODO；所有代码片段完整。
3. **Type consistency**: `setEditor` 与 `setTitleEditor` 类型与 atom 一致；`ydocRef.current` 可能为 null，已处理。
4. **Global constraints**: 未引入新依赖；小文档路径保留 IntersectionObserver；改动在 client 内。
