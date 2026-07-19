import "@/features/editor/styles/index.css";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAtom } from "jotai";
import {
  pageEditorAtom,
  readOnlyEditorAtom,
} from "@/features/editor/atoms/editor-atoms";

export const SNAPSHOT_RENDERED_EVENT = "PAGE_SNAPSHOT_RENDERED";
export const SNAPSHOT_OUTLINE_EVENT = "PAGE_SNAPSHOT_OUTLINE";
export const SNAPSHOT_ENSURE_TOC_EVENT = "PAGE_SNAPSHOT_ENSURE_TOC";

// Number of top-level blocks to render in the first paint. Large documents
// are rendered incrementally to avoid blocking the main thread with a huge
// DOM parse/layout pass.
const INITIAL_CHUNK_COUNT = 50;
const CHUNK_SIZE = 30;
const CHUNK_ROOT_MARGIN = "200px";

export type SnapshotOutlineItem = {
  label: string;
  level: number;
  tocIndex: number;
  chunkIndex: number;
  id?: string;
};

// Keep the latest outline outside React so TOC can read it when it mounts
// after the initial PAGE_SNAPSHOT_OUTLINE event has already fired.
let lastSnapshotOutline: SnapshotOutlineItem[] = [];

export function getLastSnapshotOutline() {
  return lastSnapshotOutline;
}

function scrollToTocTarget(tocIndex: number, id?: string) {
  const target =
    document.querySelector<HTMLElement>(
      `[data-page-snapshot] [data-toc-index="${tocIndex}"]`,
    ) || (id ? document.getElementById(id) : null);

  if (!target) return false;

  // Prefer window scroll with header offset; scrollIntoView alone often feels
  // like a no-op when a fixed page header covers the heading.
  const headerOffset = 72;
  const top =
    target.getBoundingClientRect().top + window.scrollY - headerOffset;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  return true;
}

function ensureTocTargetVisible(tocIndex: number, id?: string) {
  if (scrollToTocTarget(tocIndex, id)) return;

  // Newly appended chunks may not be laid out for one or more frames.
  let attempts = 0;
  const maxAttempts = 12;
  const tick = () => {
    attempts += 1;
    if (scrollToTocTarget(tocIndex, id) || attempts >= maxAttempts) return;
    window.setTimeout(tick, attempts < 4 ? 16 : 50);
  };
  requestAnimationFrame(tick);
}

interface PageContentSnapshotProps {
  renderedContent?: string;
}

export function PageContentSnapshot({
  renderedContent,
}: PageContentSnapshotProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const chunksRef = useRef<Element[]>([]);
  const renderedCountRef = useRef(0);
  const chunkIndexByIdRef = useRef<Map<string, number>>(new Map());
  const outlineRef = useRef<SnapshotOutlineItem[]>([]);
  const [isComplete, setIsComplete] = useState(false);

  const scrollToHash = useCallback(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const target = document.getElementById(hash);
    if (target) {
      target.scrollIntoView({ block: "start" });
    }
  }, []);

  const publishOutline = useCallback(() => {
    lastSnapshotOutline = outlineRef.current;
    document.dispatchEvent(
      new CustomEvent(SNAPSHOT_OUTLINE_EVENT, {
        detail: { outline: outlineRef.current },
      }),
    );
  }, []);

  const appendChunks = useCallback(
    (count: number, targetIndex: number = -1) => {
      const container = rootRef.current;
      const chunks = chunksRef.current;
      if (!container || chunks.length === 0) return false;

      // If a hash target is requested, render at least up to that chunk so the
      // anchored element exists in the DOM.
      let end = renderedCountRef.current + count;
      if (targetIndex >= 0) {
        end = Math.max(end, targetIndex + 1);
      }
      end = Math.min(end, chunks.length);

      if (end <= renderedCountRef.current) {
        return renderedCountRef.current >= chunks.length;
      }

      const fragment = document.createDocumentFragment();
      for (let i = renderedCountRef.current; i < end; i++) {
        fragment.appendChild(chunks[i]);
      }
      container.appendChild(fragment);
      renderedCountRef.current = end;

      const complete = renderedCountRef.current >= chunks.length;
      if (complete) {
        setIsComplete(true);
      }

      // Notify TOC whenever newly mounted headings become available.
      document.dispatchEvent(new CustomEvent(SNAPSHOT_RENDERED_EVENT));
      return complete;
    },
    [],
  );

  // Parse renderedContent into top-level chunks and render the initial batch.
  // Remaining chunks are loaded when the sentinel approaches the viewport.
  useEffect(() => {
    const container = rootRef.current;
    if (!container) return;

    container.replaceChildren();
    chunksRef.current = [];
    renderedCountRef.current = 0;
    chunkIndexByIdRef.current = new Map();
    outlineRef.current = [];
    lastSnapshotOutline = [];

    if (!renderedContent) {
      setIsComplete(true);
      publishOutline();
      document.dispatchEvent(new CustomEvent(SNAPSHOT_RENDERED_EVENT));
      return;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(renderedContent, "text/html");
    const chunks = Array.from(doc.body.children);
    chunksRef.current = chunks;
    setIsComplete(false);

    const outline: SnapshotOutlineItem[] = [];
    chunks.forEach((chunk, chunkIndex) => {
      const id = chunk.id;
      if (id) {
        chunkIndexByIdRef.current.set(id, chunkIndex);
      }
      chunk.querySelectorAll("[id]").forEach((element) => {
        if (!chunkIndexByIdRef.current.has(element.id)) {
          chunkIndexByIdRef.current.set(element.id, chunkIndex);
        }
      });

      // Build the full outline from the complete HTML, not only the currently
      // mounted DOM. Large pages lazy-load body chunks, so scanning the live
      // snapshot alone would truncate the TOC.
      chunk.querySelectorAll("h1, h2, h3").forEach((heading) => {
        const label = heading.textContent?.trim();
        if (!label) return;
        const tocIndex = outline.length;
        heading.setAttribute("data-toc-index", String(tocIndex));
        outline.push({
          label,
          level: Number(heading.tagName.slice(1)),
          tocIndex,
          chunkIndex,
          id: heading.id || undefined,
        });
      });
    });
    outlineRef.current = outline;
    publishOutline();

    // Prefer rendering far enough for the current hash target so deep links
    // still land on the right heading after the first paint.
    const hash = window.location.hash.slice(1);
    const hashIndex = hash ? (chunkIndexByIdRef.current.get(hash) ?? -1) : -1;

    if (chunks.length === 0) {
      setIsComplete(true);
      document.dispatchEvent(new CustomEvent(SNAPSHOT_RENDERED_EVENT));
      return;
    }

    if (chunks.length <= INITIAL_CHUNK_COUNT) {
      appendChunks(chunks.length);
    } else {
      appendChunks(INITIAL_CHUNK_COUNT, hashIndex);
    }

    // Defer the scroll until after the initial batch is in the DOM.
    if (hashIndex >= 0) {
      requestAnimationFrame(() => {
        scrollToHash();
      });
    }
  }, [renderedContent, appendChunks, scrollToHash, publishOutline]);

  // Sentinel-based lazy loading for the remaining chunks.
  useEffect(() => {
    if (isComplete) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        appendChunks(CHUNK_SIZE);
      },
      { rootMargin: CHUNK_ROOT_MARGIN },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isComplete, appendChunks, renderedContent]);

  // If the user navigates to an in-page anchor, ensure the target chunk is
  // rendered even if it is currently outside the lazy-loaded viewport.
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      const targetIndex = chunkIndexByIdRef.current.get(hash);
      if (targetIndex === undefined) return;
      if (targetIndex >= renderedCountRef.current) {
        appendChunks(0, targetIndex);
      }
      requestAnimationFrame(() => {
        scrollToHash();
      });
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [appendChunks, scrollToHash]);

  // TOC clicks for not-yet-mounted headings request the corresponding chunk.
  useEffect(() => {
    const handleEnsureToc = (event: Event) => {
      const detail = (event as CustomEvent<{ tocIndex?: number }>).detail;
      const tocIndex = detail?.tocIndex;
      if (tocIndex === undefined) return;

      const item = outlineRef.current[tocIndex];
      if (!item) return;

      if (item.chunkIndex >= renderedCountRef.current) {
        appendChunks(0, item.chunkIndex);
      }

      // Scroll after mount/layout. Works for both already-rendered headings
      // and headings that were just appended from lazy chunks.
      ensureTocTargetVisible(tocIndex, item.id);
    };

    document.addEventListener(SNAPSHOT_ENSURE_TOC_EVENT, handleEnsureToc);
    return () => {
      document.removeEventListener(SNAPSHOT_ENSURE_TOC_EVENT, handleEnsureToc);
    };
  }, [appendChunks]);

  // Comment click handling: the snapshot HTML may contain elements annotated
  // with data-comment-id; clicking them opens the comment sidebar.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const handleCommentClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const comment = target?.closest<HTMLElement>("[data-comment-id]");
      if (!comment || !root.contains(comment)) return;

      const selection = document.getSelection();
      if (selection?.type === "Range") return;

      document.dispatchEvent(
        new CustomEvent("ACTIVE_COMMENT_EVENT", {
          detail: {
            commentId: comment.dataset.commentId,
            resolved: comment.dataset.resolved === "true",
          },
        }),
      );
    };

    root.addEventListener("click", handleCommentClick);
    return () => {
      root.removeEventListener("click", handleCommentClick);
    };
  }, [renderedContent]);

  return (
    <div>
      <div
        ref={rootRef}
        className="ProseMirror page-readonly-snapshot"
        data-page-snapshot
        role="document"
      />
      {!isComplete && (
        <div
          ref={sentinelRef}
          aria-hidden="true"
          style={{ height: 1, width: "100%" }}
        />
      )}
    </div>
  );
}

interface ReadonlyPageSnapshotProps extends PageContentSnapshotProps {
  title: string;
  children?: React.ReactNode;
}

export default function ReadonlyPageSnapshot({
  title,
  renderedContent,
  children,
}: ReadonlyPageSnapshotProps) {
  const [, setPageEditor] = useAtom(pageEditorAtom);
  const [, setReadOnlyEditor] = useAtom(readOnlyEditorAtom);

  useEffect(() => {
    setPageEditor(null);
    setReadOnlyEditor(null);
  }, [setPageEditor, setReadOnlyEditor]);

  return (
    <>
      <div className="ProseMirror page-snapshot-title">
        <h1>{title}</h1>
      </div>
      {children}
      <PageContentSnapshot renderedContent={renderedContent} />
      <div style={{ paddingBottom: "20vh" }} />
    </>
  );
}
