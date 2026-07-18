import "@/features/editor/styles/index.css";
import React, { useEffect, useRef } from "react";
import { useAtom } from "jotai";
import {
  pageEditorAtom,
  readOnlyEditorAtom,
} from "@/features/editor/atoms/editor-atoms";

const SNAPSHOT_RENDERED_EVENT = "PAGE_SNAPSHOT_RENDERED";

interface PageContentSnapshotProps {
  renderedContent?: string;
}

export function PageContentSnapshot({
  renderedContent,
}: PageContentSnapshotProps) {
  const rootRef = useRef<HTMLDivElement>(null);

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

    const frame = requestAnimationFrame(() => {
      document.dispatchEvent(new CustomEvent(SNAPSHOT_RENDERED_EVENT));
      const hash = window.location.hash.slice(1);
      if (hash) {
        document.getElementById(hash)?.scrollIntoView({ block: "start" });
      }
    });

    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener("click", handleCommentClick);
    };
  }, [renderedContent]);

  return (
    <div
      ref={rootRef}
      className="ProseMirror page-readonly-snapshot"
      data-page-snapshot
      role="document"
      // The HTML is produced by the server's ProseMirror schema serializer,
      // not from arbitrary client input.
      dangerouslySetInnerHTML={{ __html: renderedContent || "" }}
    />
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
