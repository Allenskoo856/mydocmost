import { NodePos, useEditor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import React, { FC, useEffect, useLayoutEffect, useRef, useState } from "react";
import classes from "./table-of-contents.module.css";
import clsx from "clsx";
import { Box, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useDebouncedCallback } from "@mantine/hooks";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import {
  getLastSnapshotOutline,
  SNAPSHOT_ENSURE_TOC_EVENT,
  SNAPSHOT_OUTLINE_EVENT,
  SNAPSHOT_RENDERED_EVENT,
  type SnapshotOutlineItem,
} from "@/features/editor/readonly-page-snapshot";

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

type TableOfContentsProps = {
  editor: ReturnType<typeof useEditor> | null;
  isShare?: boolean;
};

export type HeadingLink = {
  label: string;
  level: number;
  element?: HTMLElement | null;
  position?: number;
  tocIndex?: number;
};

const recalculateLinks = (nodePos: NodePos[]) => {
  const nodes: HTMLElement[] = [];

  const links: HeadingLink[] = Array.from(nodePos).reduce<HeadingLink[]>(
    (acc, item) => {
      const label = item.node.textContent;
      const level = Number(item.node.attrs.level);
      if (label.length && level <= 3) {
        acc.push({
          label,
          level,
          element: item.element,
          //@ts-ignore
          position: item.resolvedPos.pos,
        });
        nodes.push(item.element);
      }
      return acc;
    },
    [],
  );
  return { links, nodes };
};

const resolveSnapshotElement = (item: SnapshotOutlineItem | HeadingLink) => {
  if ("tocIndex" in item && item.tocIndex !== undefined) {
    return document.querySelector<HTMLElement>(
      `[data-page-snapshot] [data-toc-index="${item.tocIndex}"]`,
    );
  }
  return null;
};

const rangeContainsHeading = (
  doc: ProseMirrorNode,
  from: number,
  to: number,
) => {
  let containsHeading = false;
  const safeFrom = Math.max(0, Math.min(from - 1, doc.content.size));
  const safeTo = Math.max(safeFrom, Math.min(to + 1, doc.content.size));

  doc.nodesBetween(safeFrom, safeTo, (node) => {
    if (node.type.name === "heading") {
      containsHeading = true;
      return false;
    }
  });

  return containsHeading;
};

const transactionChangesHeading = (transaction: Transaction) => {
  if (!transaction.docChanged) return false;
  if (transaction.selection.$head.parent.type.name === "heading") {
    return true;
  }

  let changesHeading = false;
  transaction.mapping.maps.forEach((stepMap) => {
    stepMap.forEach((oldFrom, oldTo, newFrom, newTo) => {
      if (
        rangeContainsHeading(transaction.before, oldFrom, oldTo) ||
        rangeContainsHeading(transaction.doc, newFrom, newTo)
      ) {
        changesHeading = true;
      }
    });
  });

  return changesHeading;
};

export const TableOfContents: FC<TableOfContentsProps> = (props) => {
  const { t } = useTranslation();
  const [links, setLinks] = useState<HeadingLink[]>([]);
  const [headingDOMNodes, setHeadingDOMNodes] = useState<HTMLElement[]>([]);
  const [activeElement, setActiveElement] = useState<HTMLElement | null>(null);
  const [activeTocIndex, setActiveTocIndex] = useState<number | null>(null);
  const headerPaddingRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const outlineRef = useRef<SnapshotOutlineItem[]>(getLastSnapshotOutline());

  const handleScrollToHeading = (item: HeadingLink) => {
    // Snapshot/lazy mode: ask the snapshot renderer to mount/scroll target.
    // Do this for every outline item, including already-mounted headings,
    // so read mode uses one reliable scroll path.
    if (!props.editor || item.position === undefined) {
      if (item.tocIndex !== undefined) {
        document.dispatchEvent(
          new CustomEvent(SNAPSHOT_ENSURE_TOC_EVENT, {
            detail: { tocIndex: item.tocIndex },
          }),
        );
        return;
      }

      // Fallback if outline metadata is missing.
      if (item.element) {
        const headerOffset = 72;
        const top =
          item.element.getBoundingClientRect().top +
          window.scrollY -
          headerOffset;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      }
      return;
    }

    const position = item.position;
    const { view } = props.editor;

    const headerOffset = parseInt(
      window.getComputedStyle(headerPaddingRef.current).getPropertyValue("top"),
    );

    const { node } = view.domAtPos(position);
    const element = node as HTMLElement;
    const scrollPosition =
      element.getBoundingClientRect().top + window.scrollY - headerOffset;

    window.scrollTo({
      top: scrollPosition,
      behavior: "smooth",
    });

    const tr = view.state.tr;
    tr.setSelection(new TextSelection(tr.doc.resolve(position)));
    view.dispatch(tr);
    view.focus();
  };

  const handleUpdate = () => {
    if (props.editor) {
      const result = recalculateLinks(props.editor.$nodes("heading") || []);
      setLinks(result.links);
      setHeadingDOMNodes(result.nodes);
      setActiveTocIndex(null);
      return;
    }

    if (outlineRef.current.length === 0) {
      outlineRef.current = getLastSnapshotOutline();
    }

    // Prefer the complete outline extracted from the full snapshot HTML.
    if (outlineRef.current.length > 0) {
      const nextLinks = outlineRef.current.map((item) => ({
        label: item.label,
        level: item.level,
        tocIndex: item.tocIndex,
        element: resolveSnapshotElement(item),
      }));
      setLinks(nextLinks);
      setHeadingDOMNodes(
        nextLinks
          .map((item) => item.element)
          .filter((element): element is HTMLElement => !!element),
      );
      return;
    }

    // Fallback for older snapshot markup that only has live DOM headings.
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-page-snapshot] h1, [data-page-snapshot] h2, [data-page-snapshot] h3",
      ),
    );
    const nextLinks = elements
      .filter((element) => element.textContent?.trim())
      .map((element, index) => ({
        label: element.textContent.trim(),
        level: Number(element.tagName.slice(1)),
        element,
        tocIndex: index,
      }));
    setLinks(nextLinks);
    setHeadingDOMNodes(elements);
  };

  // A heading rescan walks the whole document; debounce it so collab sync
  // bursts and rapid edits don't trigger a full scan per transaction.
  const debouncedHandleUpdate = useDebouncedCallback(handleUpdate, 300);
  const handleEditorUpdate = ({
    transaction,
  }: {
    transaction: Transaction;
  }) => {
    if (transactionChangesHeading(transaction)) {
      debouncedHandleUpdate();
    }
  };

  useEffect(() => {
    const handleOutline = (event: Event) => {
      const detail = (event as CustomEvent<{ outline?: SnapshotOutlineItem[] }>)
        .detail;
      outlineRef.current = detail?.outline || [];
      handleUpdate();
    };

    props.editor?.on("update", handleEditorUpdate);
    document.addEventListener(SNAPSHOT_RENDERED_EVENT, handleUpdate);
    document.addEventListener(SNAPSHOT_OUTLINE_EVENT, handleOutline);
    const frame = requestAnimationFrame(handleUpdate);

    return () => {
      cancelAnimationFrame(frame);
      props.editor?.off("update", handleEditorUpdate);
      document.removeEventListener(SNAPSHOT_RENDERED_EVENT, handleUpdate);
      document.removeEventListener(SNAPSHOT_OUTLINE_EVENT, handleOutline);
    };
  }, [props.editor, debouncedHandleUpdate]);

  useEffect(() => {
    if (props.editor) {
      // Editor mode uses live DOM nodes for active-heading tracking.
      if (headingDOMNodes.length === 0) return;

      const headerOffset = headerPaddingRef.current
        ? parseInt(
            window
              .getComputedStyle(headerPaddingRef.current)
              .getPropertyValue("top"),
          )
        : 0;

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
          setActiveElement((current) => (current === active ? current : active));
        };

        const throttledFind = throttle(findActiveHeading, 100);
        window.addEventListener("scroll", throttledFind, { passive: true });
        findActiveHeading();
        return () => window.removeEventListener("scroll", throttledFind);
      }

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

        headingDOMNodes.forEach((heading) => observer.observe(heading));
        return () => observer.disconnect();
      } catch (err) {
        console.log(err);
      }
      return;
    }

    // Snapshot mode: track active item by outline index so lazy-mounted
    // headings still highlight correctly once they appear.
    if (links.length === 0) return;

    const headerOffset = headerPaddingRef.current
      ? parseInt(
          window
            .getComputedStyle(headerPaddingRef.current)
            .getPropertyValue("top"),
        )
      : 0;

    const findActiveFromOutline = () => {
      let activeIndex: number | null = null;
      for (let i = 0; i < links.length; i++) {
        const element =
          links[i].element ||
          document.querySelector<HTMLElement>(
            `[data-page-snapshot] [data-toc-index="${links[i].tocIndex}"]`,
          );
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        if (rect.top > headerOffset) {
          activeIndex = i > 0 ? (links[i - 1].tocIndex ?? i - 1) : (links[i].tocIndex ?? i);
          break;
        }
        activeIndex = links[i].tocIndex ?? i;
      }
      setActiveTocIndex((current) =>
        current === activeIndex ? current : activeIndex,
      );
    };

    const throttledFind = throttle(findActiveFromOutline, 100);
    window.addEventListener("scroll", throttledFind, { passive: true });
    findActiveFromOutline();
    return () => window.removeEventListener("scroll", throttledFind);
  }, [headingDOMNodes, links, props.editor]);

  // Keep the active TOC entry visible inside the floating panel while the
  // page scrolls. Without this, the highlight moves but the panel stays put.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const activeButton = list.querySelector<HTMLElement>(
      '[data-toc-active="true"]',
    );
    if (!activeButton) return;

    const scrollParent =
      (activeButton.closest(
        '[class*="floatingTocBody"], [class*="tocScrollArea"]',
      ) as HTMLElement | null) ||
      (list.parentElement as HTMLElement | null);

    if (!scrollParent) {
      activeButton.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }

    const parentRect = scrollParent.getBoundingClientRect();
    const itemRect = activeButton.getBoundingClientRect();
    const padding = 12;
    const fullyAbove = itemRect.bottom < parentRect.top;
    const fullyBelow = itemRect.top > parentRect.bottom;

    // Large jumps (e.g. 5.2 -> chapter 10) center the active item so users
    // immediately see where they are in the outline.
    if (fullyAbove || fullyBelow) {
      const delta =
        itemRect.top -
        parentRect.top -
        (parentRect.height / 2 - itemRect.height / 2);
      scrollParent.scrollTop += delta;
      return;
    }

    if (itemRect.top < parentRect.top + padding) {
      scrollParent.scrollTop -= parentRect.top + padding - itemRect.top;
      return;
    }

    if (itemRect.bottom > parentRect.bottom - padding) {
      scrollParent.scrollTop += itemRect.bottom - (parentRect.bottom - padding);
    }
  }, [activeElement, activeTocIndex, links.length]);

  if (!links.length) {
    return (
      <>
        {!props.isShare && (
          <Text size="sm">
            {t("Add headings (H1, H2, H3) to generate a table of contents.")}
          </Text>
        )}

        {props.isShare && (
          <Text size="sm" c="dimmed">
            {t("No table of contents.")}
          </Text>
        )}
      </>
    );
  }

  return (
    <>
      <div
        ref={listRef}
        className={props.isShare ? classes.leftBorder : ""}
      >
        {links.map((item, idx) => {
          const isActive = props.editor
            ? item.element === activeElement
            : item.tocIndex === activeTocIndex;
          return (
            <Box<"button">
              component="button"
              onClick={() => handleScrollToHeading(item)}
              key={item.tocIndex ?? idx}
              data-toc-active={isActive ? "true" : undefined}
              className={clsx(classes.link, {
                [classes.linkActive]: isActive,
              })}
              style={{
                paddingLeft: `calc(8px + ${(item.level - 1) * 12}px)`,
              }}
            >
              {item.label}
            </Box>
          );
        })}
      </div>
      <div ref={headerPaddingRef} className={classes.headerPadding} />
    </>
  );
};
