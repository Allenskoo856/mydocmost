import { NodePos, useEditor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import React, { FC, useEffect, useRef, useState } from "react";
import classes from "./table-of-contents.module.css";
import clsx from "clsx";
import { Box, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useDebouncedCallback } from "@mantine/hooks";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

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
  element: HTMLElement;
  position?: number;
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

const recalculateSnapshotLinks = () => {
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>(
      "[data-page-snapshot] h1, [data-page-snapshot] h2, [data-page-snapshot] h3",
    ),
  );
  const links = elements
    .filter((element) => element.textContent?.trim())
    .map((element) => ({
      label: element.textContent.trim(),
      level: Number(element.tagName.slice(1)),
      element,
    }));

  return { links, nodes: elements };
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
  const headerPaddingRef = useRef<HTMLDivElement | null>(null);

  const handleScrollToHeading = (item: HeadingLink) => {
    if (!props.editor || item.position === undefined) {
      item.element.scrollIntoView({ behavior: "smooth", block: "start" });
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
    const result = props.editor
      ? recalculateLinks(props.editor.$nodes("heading"))
      : recalculateSnapshotLinks();

    setLinks(result.links);
    setHeadingDOMNodes(result.nodes);
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
    props.editor?.on("update", handleEditorUpdate);
    document.addEventListener("PAGE_SNAPSHOT_RENDERED", handleUpdate);
    const frame = requestAnimationFrame(handleUpdate);

    return () => {
      cancelAnimationFrame(frame);
      props.editor?.off("update", handleEditorUpdate);
      document.removeEventListener("PAGE_SNAPSHOT_RENDERED", handleUpdate);
    };
  }, [props.editor, debouncedHandleUpdate]);

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
        setActiveElement((current) => (current === active ? current : active));
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
      {props.isShare && (
        <Text mb="md" fw={500}>
          {t("Table of contents")}
        </Text>
      )}
      <div className={props.isShare ? classes.leftBorder : ""}>
        {links.map((item, idx) => (
          <Box<"button">
            component="button"
            onClick={() => handleScrollToHeading(item)}
            key={idx}
            className={clsx(classes.link, {
              [classes.linkActive]: item.element === activeElement,
            })}
            style={{
              paddingLeft: `calc(${item.level} * var(--mantine-spacing-md))`,
            }}
          >
            {item.label}
          </Box>
        ))}
      </div>
      <div ref={headerPaddingRef} className={classes.headerPadding} />
    </>
  );
};
