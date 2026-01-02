import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

export interface DatabaseRefOptions {
  HTMLAttributes: Record<string, any>;
  view: any;
}

export interface DatabaseRefAttrs {
  databaseId: string;
  viewId: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    docDatabases: {
      insertDatabaseRef: (attrs: DatabaseRefAttrs) => ReturnType;
    };
  }
}

export const DatabaseRef = Node.create<DatabaseRefOptions>({
  name: 'databaseRef',
  group: 'block',
  atom: true,
  selectable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      view: null,
    };
  },

  addAttributes() {
    return {
      databaseId: {
        default: null,
      },
      viewId: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-docmost-database-ref]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-docmost-database-ref': 'true',
        'data-database-id': HTMLAttributes.databaseId,
        'data-view-id': HTMLAttributes.viewId,
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(this.options.view);
  },

  addCommands() {
    return {
      insertDatabaseRef:
        (attrs: DatabaseRefAttrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
    };
  },
});
