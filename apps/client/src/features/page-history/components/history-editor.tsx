import "@/features/editor/styles/index.css";
import React, { useEffect, useMemo } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import {
  largeDocumentExtensions,
  mainExtensions,
} from "@/features/editor/extensions/extensions";
import { Title } from "@mantine/core";
import { isLargeDocumentContent } from "@/features/editor/utils/large-document";

export interface HistoryEditorProps {
  title: string;
  content: any;
}

export function HistoryEditor({ title, content }: HistoryEditorProps) {
  const isLargeContent = useMemo(
    () => isLargeDocumentContent(content),
    [content],
  );
  const extensions = isLargeContent ? largeDocumentExtensions : mainExtensions;
  const editor = useEditor(
    {
      extensions,
      editable: false,
    },
    [isLargeContent],
  );

  useEffect(() => {
    if (editor && content) {
      editor.commands.setContent(content);
    }
  }, [title, content, editor]);

  return (
    <>
      <div>
        <Title order={1}>{title}</Title>

        {editor && <EditorContent editor={editor} />}
      </div>
    </>
  );
}
