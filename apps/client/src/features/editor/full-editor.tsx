import classes from "@/features/editor/styles/editor.module.css";
import React, { useEffect } from "react";
import { TitleEditor } from "@/features/editor/title-editor";
import PageEditor from "@/features/editor/page-editor";
import ReadonlyPageSnapshot from "@/features/editor/readonly-page-snapshot";
import { Container } from "@mantine/core";
import { useAtom } from "jotai";
import { useMediaQuery } from "@mantine/hooks";
import {
  userAtom,
  currentUserAtom,
} from "@/features/user/atoms/current-user-atom.ts";
import PagePropertiesPanel from "@/features/page/components/page-properties-panel.tsx";
import { PageEditMode } from "@/features/user/types/user.types.ts";
import { pageForceEditAtom } from "@/features/editor/atoms/editor-atoms.ts";
import { asideStateAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom";
import {
  activeCommentIdAtom,
  showCommentPopupAtom,
} from "@/features/comment/atoms/comment-atom";

const MemoizedTitleEditor = React.memo(TitleEditor);
const MemoizedPageEditor = React.memo(PageEditor);

export interface FullEditorProps {
  pageId: string;
  slugId: string;
  title: string;
  content?: unknown;
  renderedContent?: string;
  contentSize?: number;
  spaceSlug: string;
  spaceId: string;
  editable: boolean;
}

export function FullEditor({
  pageId,
  title,
  slugId,
  content,
  renderedContent,
  contentSize,
  spaceSlug,
  spaceId,
  editable,
}: FullEditorProps) {
  const [user] = useAtom(userAtom);
  const fullPageWidth = user.settings?.preferences?.fullPageWidth;
  const [currentUser] = useAtom(currentUserAtom);
  const [forceEdit, setForceEdit] = useAtom(pageForceEditAtom);
  const [, setAsideState] = useAtom(asideStateAtom);
  const [, setActiveCommentId] = useAtom(activeCommentIdAtom);
  const [, setShowCommentPopup] = useAtom(showCommentPopupAtom);
  const isMobile = useMediaQuery("(max-width: 48em)");
  const userPageEditMode =
    currentUser?.user?.settings?.preferences?.pageEditMode ?? PageEditMode.Edit;
  const tocDefaultOpen =
    currentUser?.user?.settings?.preferences?.tocDefaultOpen ?? false;

  // A page switch remounts this component via key={page.id}; make sure the
  // next page starts in read mode again.
  useEffect(() => {
    return () => setForceEdit(false);
  }, [setForceEdit]);

  // Reset comment state and apply the aside default on every page switch.
  // Lives here (not in PageEditor) so it also runs in static read mode.
  useEffect(() => {
    setActiveCommentId(null);
    setShowCommentPopup(false);
    if (!isMobile && tocDefaultOpen) {
      setAsideState({ tab: "toc", isAsideOpen: true });
      return;
    }
    setAsideState({ tab: "", isAsideOpen: false });
  }, [pageId, isMobile, tocDefaultOpen]);

  // Static read mode: render the document without the collaborative stack
  // (no Yjs document, WebSocket connection or IndexedDB sync), saving a full
  // document parse + sync cycle. Users without edit permission always take
  // this path; users with the "read" default mode upgrade to the full collab
  // editor via the header "Edit" button.
  const readMode =
    !editable || (userPageEditMode === PageEditMode.Read && !forceEdit);

  return (
    <Container
      fluid={fullPageWidth}
      size={!fullPageWidth && 900}
      className={classes.editor}
    >
      {readMode ? (
        <ReadonlyPageSnapshot title={title} renderedContent={renderedContent}>
          <PagePropertiesPanel
            pageId={pageId}
            spaceId={spaceId}
            editable={editable}
          />
        </ReadonlyPageSnapshot>
      ) : (
        <>
          <MemoizedTitleEditor
            pageId={pageId}
            slugId={slugId}
            title={title}
            spaceSlug={spaceSlug}
            editable={editable}
          />
          <PagePropertiesPanel
            pageId={pageId}
            spaceId={spaceId}
            editable={editable}
          />
          <MemoizedPageEditor
            pageId={pageId}
            editable={editable}
            content={content}
            renderedContent={renderedContent}
            contentSize={contentSize}
          />
        </>
      )}
    </Container>
  );
}
