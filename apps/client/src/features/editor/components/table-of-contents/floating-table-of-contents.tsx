import {
  ActionIcon,
  Text,
  Tooltip,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconX } from "@tabler/icons-react";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { asideStateAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import { pageEditorAtom } from "@/features/editor/atoms/editor-atoms.ts";
import { TableOfContents } from "@/features/editor/components/table-of-contents/table-of-contents.tsx";
import type { useEditor } from "@tiptap/react";
import classes from "@/components/layouts/global/app-shell.module.css";

const TOC_WIDTH = 252;
const TOC_GAP = 16;
const MOBILE_BREAKPOINT = "(max-width: 48em)";

type PlacementMode = "gutter" | "overlay" | "drawer";

type FloatingTableOfContentsProps = {
  editor?: ReturnType<typeof useEditor> | null;
  isShare?: boolean;
  onClose?: () => void;
};

type Placement = {
  mode: PlacementMode;
  style: CSSProperties;
};

function measurePlacement(isMobile: boolean): Placement {
  if (isMobile) {
    return {
      mode: "drawer",
      style: {},
    };
  }

  const content =
    document.querySelector<HTMLElement>("[data-page-content]") ||
    document.querySelector<HTMLElement>(".editor");

  const headerOffset = 56;
  const top = headerOffset;
  // Keep the floating panel compact; overflow scrolls inside the body.
  const maxHeight = 420;

  if (!content) {
    return {
      mode: "overlay",
      style: {
        top,
        right: 12,
        left: "auto",
        width: TOC_WIDTH,
        height: maxHeight,
        maxHeight,
      },
    };
  }

  const rect = content.getBoundingClientRect();
  const spaceRight = window.innerWidth - rect.right;
  const canUseGutter = spaceRight >= TOC_WIDTH + TOC_GAP;

  if (canUseGutter) {
    // Prefer sitting in the free gutter beside the article column.
    // Clamp so it never leaves the viewport.
    const left = Math.min(
      rect.right + TOC_GAP,
      window.innerWidth - TOC_WIDTH - 12,
    );
    return {
      mode: "gutter",
      style: {
        top,
        left,
        right: "auto",
        width: TOC_WIDTH,
        height: maxHeight,
        maxHeight,
      },
    };
  }

  // Not enough free space: overlay on the right edge without reflowing content.
  return {
    mode: "overlay",
    style: {
      top,
      right: 12,
      left: "auto",
      width: TOC_WIDTH,
      height: maxHeight,
      maxHeight,
    },
  };
}

export function FloatingTableOfContents({
  editor,
  isShare = false,
  onClose,
}: FloatingTableOfContentsProps) {
  const { t } = useTranslation();
  const pageEditor = useAtomValue(pageEditorAtom);
  const [, setAsideState] = useAtom(asideStateAtom);
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT) ?? false;
  const [placement, setPlacement] = useState<Placement>(() =>
    measurePlacement(false),
  );

  const resolvedEditor = editor === undefined ? pageEditor : editor;

  const closeToc = useCallback(() => {
    if (onClose) {
      onClose();
      return;
    }
    setAsideState({ tab: "toc", isAsideOpen: false });
  }, [onClose, setAsideState]);

  const updatePlacement = useCallback(() => {
    setPlacement(measurePlacement(isMobile));
  }, [isMobile]);

  useEffect(() => {
    updatePlacement();

    const onResize = () => updatePlacement();
    window.addEventListener("resize", onResize);

    const content =
      document.querySelector("[data-page-content]") ||
      document.querySelector(".editor");

    let observer: ResizeObserver | null = null;
    if (content && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => updatePlacement());
      observer.observe(content);
    }

    // Content/layout can settle after first paint (sidebar, fonts, etc.).
    const frame = window.requestAnimationFrame(updatePlacement);
    const timer = window.setTimeout(updatePlacement, 120);

    return () => {
      window.removeEventListener("resize", onResize);
      observer?.disconnect();
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [updatePlacement]);

  const modeClass =
    placement.mode === "gutter"
      ? classes.floatingTocGutter
      : placement.mode === "drawer"
        ? classes.floatingTocDrawer
        : classes.floatingTocOverlay;

  return (
    <>
      {placement.mode === "drawer" && (
        <button
          type="button"
          className={classes.floatingTocBackdrop}
          aria-label={t("Close")}
          onClick={closeToc}
        />
      )}

      <div
        className={`${classes.floatingToc} ${modeClass} print-hide`}
        role="complementary"
        aria-label={t("Table of contents")}
        style={placement.mode === "drawer" ? undefined : placement.style}
      >
        <div className={classes.floatingTocHeader}>
          <Text size="sm" fw={600}>
            {t("Table of contents")}
          </Text>
          <Tooltip label={t("Close")} withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label={t("Close")}
              onClick={closeToc}
            >
              <IconX size={16} stroke={1.8} />
            </ActionIcon>
          </Tooltip>
        </div>

        <div className={classes.floatingTocBody}>
          <TableOfContents editor={resolvedEditor} isShare={isShare} />
        </div>
      </div>
    </>
  );
}
