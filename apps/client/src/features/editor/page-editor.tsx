import "@/features/editor/styles/index.css";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import {
  HocuspocusProvider,
  onAuthenticationFailedParameters,
  WebSocketStatus,
} from "@hocuspocus/provider";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import { Skeleton } from "@mantine/core";
import {
  collabExtensions,
  largeDocumentExtensions,
  mainExtensions,
} from "@/features/editor/extensions/extensions";
import { useAtom } from "jotai";
import useCollaborationUrl from "@/features/editor/hooks/use-collaboration-url";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import {
  pageEditorAtom,
  pageForceEditAtom,
  yjsConnectionStatusAtom,
} from "@/features/editor/atoms/editor-atoms";
import { asideStateAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom";
import {
  activeCommentIdAtom,
  showCommentPopupAtom,
} from "@/features/comment/atoms/comment-atom";
import CommentDialog from "@/features/comment/components/comment-dialog";
import { EditorBubbleMenu } from "@/features/editor/components/bubble-menu/bubble-menu";
import TableCellMenu from "@/features/editor/components/table/table-cell-menu.tsx";
import TableMenu from "@/features/editor/components/table/table-menu.tsx";
import ImageMenu from "@/features/editor/components/image/image-menu.tsx";
import CalloutMenu from "@/features/editor/components/callout/callout-menu.tsx";
import VideoMenu from "@/features/editor/components/video/video-menu.tsx";
import SubpagesMenu from "@/features/editor/components/subpages/subpages-menu.tsx";
import {
  handleFileDrop,
  handlePaste,
} from "@/features/editor/components/common/editor-paste-handler.tsx";
import LinkMenu from "@/features/editor/components/link/link-menu.tsx";
import ExcalidrawMenu from "./components/excalidraw/excalidraw-menu";
import DrawioMenu from "./components/drawio/drawio-menu";
import { useCollabToken } from "@/features/auth/queries/auth-query.tsx";
import SearchAndReplaceDialog from "@/features/editor/components/search-and-replace/search-and-replace-dialog.tsx";
import { useDebouncedCallback, useDocumentVisibility } from "@mantine/hooks";
import { useIdle } from "@/hooks/use-idle.ts";
import { queryClient } from "@/main.tsx";
import { IPage } from "@/features/page/types/page.types.ts";
import { useParams } from "react-router-dom";
import { extractPageSlugId } from "@/lib";
import { FIVE_MINUTES } from "@/lib/constants.ts";
import { PageEditMode } from "@/features/user/types/user.types.ts";
import { jwtDecode } from "jwt-decode";
import { searchSpotlight } from "@/features/search/constants.ts";
import { useEditorScroll } from "./hooks/use-editor-scroll";
import {
  isLargeDocumentContent,
  isLargeDocumentSize,
} from "./utils/large-document";
import { PageContentSnapshot } from "./readonly-page-snapshot";

interface PageEditorProps {
  pageId: string;
  editable: boolean;
  content: any;
  renderedContent?: string;
  contentSize?: number;
}

export default function PageEditor({
  pageId,
  editable,
  content,
  renderedContent,
  contentSize,
}: PageEditorProps) {
  const collaborationURL = useCollaborationUrl();
  const isComponentMounted = useRef(false);
  const editorCreated = useRef(false);

  useEffect(() => {
    isComponentMounted.current = true;
  }, []);

  const [currentUser] = useAtom(currentUserAtom);
  const [, setEditor] = useAtom(pageEditorAtom);
  const [, setAsideState] = useAtom(asideStateAtom);
  const [, setActiveCommentId] = useAtom(activeCommentIdAtom);
  const [showCommentPopup, setShowCommentPopup] = useAtom(showCommentPopupAtom);
  const ydocRef = useRef<Y.Doc | null>(null);
  if (!ydocRef.current) {
    ydocRef.current = new Y.Doc();
  }
  const ydoc = ydocRef.current;
  const [isLocalSynced, setLocalSynced] = useState(false);
  const [isRemoteSynced, setRemoteSynced] = useState(false);
  const [yjsConnectionStatus, setYjsConnectionStatus] = useAtom(
    yjsConnectionStatusAtom,
  );
  const menuContainerRef = useRef(null);
  const documentName = `page.${pageId}`;
  const { data: collabQuery, refetch: refetchCollabToken } = useCollabToken();
  const { isIdle, resetIdle } = useIdle(FIVE_MINUTES, { initialState: false });
  const documentState = useDocumentVisibility();
  const { pageSlug } = useParams();
  const slugId = extractPageSlugId(pageSlug);
  const userPageEditMode =
    currentUser?.user?.settings?.preferences?.pageEditMode ?? PageEditMode.Edit;

  const canScroll = useCallback(
    () => isComponentMounted.current && editorCreated.current,
    [isComponentMounted, editorCreated],
  );
  const { handleScrollTo } = useEditorScroll({ canScroll });
  const isLargeContent = useMemo(
    () => isLargeDocumentSize(contentSize) || isLargeDocumentContent(content),
    [content, contentSize],
  );
  const baseExtensions = isLargeContent
    ? largeDocumentExtensions
    : mainExtensions;
  // Create providers once per page mount (a page switch remounts this
  // component via key={page.id}). They are created synchronously during the
  // first render so the collab editor below is instantiated a single time
  // with the final extension set, instead of being built once without collab
  // and then destroyed and rebuilt when the provider appears. Safe without
  // StrictMode; every mount is destroyed in the cleanup effect below.
  const [providers] = useState(() => {
    const local = new IndexeddbPersistence(documentName, ydoc);
    local.on("synced", () => setLocalSynced(true));

    const remote = new HocuspocusProvider({
      name: documentName,
      url: collaborationURL,
      document: ydoc,
      token: collabQuery?.token,
      connect: true,
      preserveConnection: false,
      onAuthenticationFailed: (auth: onAuthenticationFailedParameters) => {
        const payload = jwtDecode(collabQuery?.token);
        const now = Date.now().valueOf() / 1000;
        const isTokenExpired = now >= payload.exp;
        if (isTokenExpired) {
          refetchCollabToken().then((result) => {
            if (result.data?.token) {
              remote.disconnect();
              setTimeout(() => {
                remote.configuration.token = result.data.token;
                remote.connect();
              }, 100);
            }
          });
        }
      },
      onStatus: (status) => {
        if (status.status === "connected") {
          setYjsConnectionStatus(status.status);
        }
      },
    });
    remote.on("synced", ({ state }) => setRemoteSynced(state));
    remote.on("disconnect", () => {
      setYjsConnectionStatus(WebSocketStatus.Disconnected);
    });

    return { local, remote };
  });

  const remoteProvider = providers.remote;
  const collabReady =
    remoteProvider.status === WebSocketStatus.Connected &&
    isLocalSynced &&
    isRemoteSynced;

  // Destroy providers only on final unmount
  useEffect(() => {
    return () => {
      providers.remote.destroy();
      providers.local.destroy();
    };
  }, [providers]);

  /*
  useEffect(() => {
    // Handle token updates by reconnecting with new token
    if (providersRef.current?.remote && collabQuery?.token) {
      const currentToken = providersRef.current.remote.configuration.token;
      if (currentToken !== collabQuery.token) {
        // Token has changed, need to reconnect with new token
        providersRef.current.remote.disconnect();
        providersRef.current.remote.configuration.token = collabQuery.token;
        providersRef.current.remote.connect();
      }
    }
  }, [collabQuery?.token]);
   */

  // Only connect/disconnect on tab/idle, not destroy
  useEffect(() => {
    if (!remoteProvider) return;
    if (
      isIdle &&
      documentState === "hidden" &&
      remoteProvider.status === WebSocketStatus.Connected
    ) {
      remoteProvider.disconnect();
      return;
    }
    if (
      documentState === "visible" &&
      remoteProvider.status === WebSocketStatus.Disconnected
    ) {
      resetIdle();
      remoteProvider.connect();
    }
  }, [isIdle, documentState, remoteProvider, resetIdle]);

  const extensions = useMemo(() => {
    if (!remoteProvider || !currentUser?.user) return baseExtensions;
    return [
      ...baseExtensions,
      ...collabExtensions(remoteProvider, currentUser?.user),
    ];
  }, [baseExtensions, remoteProvider, currentUser?.user]);

  const editor = useEditor(
    {
      extensions,
      editable,
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      editorProps: {
        scrollThreshold: 80,
        scrollMargin: 80,
        handleDOMEvents: {
          keydown: (_view, event) => {
            if ((event.ctrlKey || event.metaKey) && event.code === "KeyS") {
              event.preventDefault();
              return true;
            }
            if ((event.ctrlKey || event.metaKey) && event.code === "KeyK") {
              searchSpotlight.open();
              return true;
            }
            if (["ArrowUp", "ArrowDown", "Enter"].includes(event.key)) {
              const slashCommand = document.querySelector("#slash-command");
              if (slashCommand) {
                return true;
              }
            }
            if (
              [
                "ArrowUp",
                "ArrowDown",
                "ArrowLeft",
                "ArrowRight",
                "Enter",
              ].includes(event.key)
            ) {
              const emojiCommand = document.querySelector("#emoji-command");
              if (emojiCommand) {
                return true;
              }
            }
          },
        },
        handlePaste: (view, event, slice) =>
          handlePaste(view, event, pageId, currentUser?.user.id),
        handleDrop: (view, event, _slice, moved) =>
          handleFileDrop(view, event, moved, pageId),
      },
      onCreate({ editor }) {
        if (editor) {
          // @ts-ignore
          setEditor(editor);
          editor.storage.pageId = pageId;
          handleScrollTo(editor);
          editorCreated.current = true;
        }
      },
      onUpdate({ editor }) {
        if (editor.isEmpty) return;
        if (isLargeContent) return;
        // update local page cache to reduce flickers; getJSON() serializes
        // the whole document, so it must stay inside the debounced callback
        debouncedUpdateContent(editor);
      },
    },
    [pageId, editable, remoteProvider, isLargeContent],
  );

  const editorIsEditable = useEditorState({
    editor,
    selector: (ctx) => {
      return ctx.editor?.isEditable ?? false;
    },
  });

  const debouncedUpdateContent = useDebouncedCallback((editor: Editor) => {
    if (editor.isDestroyed) return;
    const pageData = queryClient.getQueryData<IPage>(["pages", slugId]);

    if (pageData) {
      queryClient.setQueryData(["pages", slugId], {
        ...pageData,
        content: editor.getJSON(),
        updatedAt: new Date(),
      });
    }
  }, 3000);

  const handleActiveCommentEvent = (event) => {
    const { commentId, resolved } = event.detail;

    if (resolved) {
      return;
    }

    setActiveCommentId(commentId);
    setAsideState({ tab: "comments", isAsideOpen: true });

    //wait if aside is closed
    setTimeout(() => {
      const selector = `div[data-comment-id="${commentId}"]`;
      const commentElement = document.querySelector(selector);
      commentElement?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 400);
  };

  useEffect(() => {
    document.addEventListener("ACTIVE_COMMENT_EVENT", handleActiveCommentEvent);
    return () => {
      document.removeEventListener(
        "ACTIVE_COMMENT_EVENT",
        handleActiveCommentEvent,
      );
    };
  }, []);

  // Reset comment state and apply the aside default on every page switch.
  // This effect moved to FullEditor so it also runs in static read mode.

  useEffect(() => {
    if (remoteProvider?.status === WebSocketStatus.Connecting) {
      const timeout = setTimeout(() => {
        setYjsConnectionStatus(WebSocketStatus.Disconnected);
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [remoteProvider?.status]);

  // forceEdit (clicking "Edit" in static read mode) overrides the read
  // preference.
  const [forceEdit] = useAtom(pageForceEditAtom);

  useEffect(() => {
    // Only honor user default page edit mode preference and permissions
    if (editor) {
      const canEdit =
        editable && (forceEdit || userPageEditMode === PageEditMode.Edit);
      editor.setEditable(canEdit);
    }
  }, [userPageEditMode, forceEdit, editor, editable]);

  const hasSyncedOnceRef = useRef(false);
  const [showStatic, setShowStatic] = useState(true);

  useEffect(() => {
    if (!hasSyncedOnceRef.current && collabReady) {
      hasSyncedOnceRef.current = true;
      setShowStatic(false);
    }
  }, [collabReady]);

  if (showStatic) {
    if (renderedContent) {
      return <PageContentSnapshot renderedContent={renderedContent} />;
    }

    return (
      <div>
        <Skeleton height={16} radius="sm" mb="sm" width="55%" />
        <Skeleton height={12} radius="sm" mb="sm" />
        <Skeleton height={12} radius="sm" mb="sm" />
        <Skeleton height={12} radius="sm" mb="sm" width="85%" />
        <Skeleton height={12} radius="sm" mb="sm" width="70%" />
      </div>
    );
  }

  return (
    <div className="editor-container" style={{ position: "relative" }}>
      <div ref={menuContainerRef}>
        <EditorContent editor={editor} />

        {editor && (
          <SearchAndReplaceDialog editor={editor} editable={editable} />
        )}

        {editor && editorIsEditable && (
          <div>
            <EditorBubbleMenu editor={editor} />
            <TableMenu editor={editor} />
            <TableCellMenu editor={editor} appendTo={menuContainerRef} />
            <ImageMenu editor={editor} />
            <VideoMenu editor={editor} />
            <CalloutMenu editor={editor} />
            <SubpagesMenu editor={editor} />
            <ExcalidrawMenu editor={editor} />
            <DrawioMenu editor={editor} />
            <LinkMenu editor={editor} appendTo={menuContainerRef} />
          </div>
        )}
        {showCommentPopup && <CommentDialog editor={editor} pageId={pageId} />}
      </div>
      <div
        onClick={() => editor.commands.focus("end")}
        style={{ paddingBottom: "20vh" }}
      ></div>
    </div>
  );
}
