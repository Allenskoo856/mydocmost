import TiptapHeading, {
  HeadingOptions as TiptapHeadingOptions,
} from "@tiptap/extension-heading";
import { mergeAttributes } from "@tiptap/react";
import { Decoration, DecorationSet } from "prosemirror-view";
import { Plugin } from "prosemirror-state";
import { copyToClipboard } from "../utils";

const copyIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><!-- Icon from Material Symbols Light by Google - https://github.com/google/material-design-icons/blob/master/LICENSE --><path fill="currentColor" d="M10.616 16.077H7.077q-1.692 0-2.884-1.192T3 12t1.193-2.885t2.884-1.193h3.539v1H7.077q-1.27 0-2.173.904Q4 10.731 4 12t.904 2.173t2.173.904h3.539zM8.5 12.5v-1h7v1zm4.885 3.577v-1h3.538q1.27 0 2.173-.904Q20 13.269 20 12t-.904-2.173t-2.173-.904h-3.538v-1h3.538q1.692 0 2.885 1.192T21 12t-1.193 2.885t-2.884 1.193z"/></svg>`;
const successIcon = `<svg xmlns="http://www.w3.org/2000/svg" style="color: forestgreen;" width="18" height="18" viewBox="0 0 24 24"><!-- Icon from Material Symbols by Google - https://github.com/google/material-design-icons/blob/master/LICENSE --><path fill="currentColor" d="m10.6 16.6l7.05-7.05l-1.4-1.4l-5.65 5.65l-2.85-2.85l-1.4 1.4zM12 22q-2.075 0-3.9-.788t-3.175-2.137T2.788 15.9T2 12t.788-3.9t2.137-3.175T8.1 2.788T12 2t3.9.788t3.175 2.137T21.213 8.1T22 12t-.788 3.9t-2.137 3.175t-3.175 2.138T12 22"/></svg>`;

const headingDecorationsKey = new PluginKey<DecorationSet>(
  "headingLinkDecorations",
);

function createHeadingLinkDecoration(node: PMNode, pos: number): Decoration {
  return Decoration.widget(
    pos + node.nodeSize - 1,
    () => {
      const icon = document.createElement("span");
      icon.classList.add("link-btn");
      icon.innerHTML = "&nbsp;";
      icon.contentEditable = "false";

      const linkBtnContent = document.createElement("span");
      linkBtnContent.classList.add("link-btn-content");
      linkBtnContent.innerHTML = copyIcon;
      icon.appendChild(linkBtnContent);

      icon.addEventListener("mousedown", (e) => e.preventDefault());
      icon.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        const id = node.attrs.id;
        const baseUrl = window.location.href.split("#")[0];
        const url = `${baseUrl}#${id}`;
        copyToClipboard(url);
        linkBtnContent.innerHTML = successIcon;
        setTimeout(() => (linkBtnContent.innerHTML = copyIcon), 2000);
      });

      return icon;
    },
    { side: 1 },
  );
}

function findHeadingLinkDecorations(
  doc: PMNode,
  from = 0,
  to = doc.content.size,
): Decoration[] {
  const decorations: Decoration[] = [];

  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === "heading" && node.content.size > 0) {
      decorations.push(createHeadingLinkDecoration(node, pos));
    }
  });

  return decorations;
}

function buildHeadingLinkDecorations(doc: PMNode): DecorationSet {
  return DecorationSet.create(doc, findHeadingLinkDecorations(doc));
}

function getChangedBlockRanges(tr: Transaction): Array<{
  from: number;
  to: number;
}> {
  const ranges: Array<{ from: number; to: number }> = [];

  tr.mapping.maps.forEach((stepMap, index) => {
    stepMap.forEach((_oldFrom, _oldTo, newFrom, newTo) => {
      const remainingMapping = tr.mapping.slice(index + 1);
      const mappedFrom = remainingMapping.map(newFrom, -1);
      const mappedTo = remainingMapping.map(newTo, 1);
      const safeFrom = Math.max(0, Math.min(mappedFrom, tr.doc.content.size));
      const safeTo = Math.max(
        safeFrom,
        Math.min(mappedTo, tr.doc.content.size),
      );
      const $from = tr.doc.resolve(safeFrom);
      const $to = tr.doc.resolve(safeTo);
      const from =
        $from.depth > 0 ? $from.before(1) : Math.max(0, safeFrom - 1);
      const to =
        $to.depth > 0
          ? $to.after(1)
          : Math.min(tr.doc.content.size, safeTo + 1);

      ranges.push({ from, to });
    });
  });

  return ranges
    .sort((a, b) => a.from - b.from)
    .reduce<typeof ranges>((merged, range) => {
      const previous = merged.at(-1);
      if (previous && range.from <= previous.to) {
        previous.to = Math.max(previous.to, range.to);
      } else {
        merged.push({ ...range });
      }
      return merged;
    }, []);
}

function updateHeadingLinkDecorations(
  tr: Transaction,
  decorationSet: DecorationSet,
): DecorationSet {
  let updated = decorationSet.map(tr.mapping, tr.doc);
  const ranges = getChangedBlockRanges(tr);

  for (const range of ranges) {
    updated = updated.remove(updated.find(range.from, range.to));
    updated = updated.add(
      tr.doc,
      findHeadingLinkDecorations(tr.doc, range.from, range.to),
    );
  }

  return updated;
}

export const Heading = TiptapHeading.extend<TiptapHeadingOptions>({
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: headingDecorationsKey,
        state: {
          init(_, { doc }) {
            return buildHeadingLinkDecorations(doc);
          },
          apply(tr, decorationSet) {
            // Only rescan the document when it actually changed; cursor moves
            // and other selection-only transactions reuse the cached set.
            if (!tr.docChanged) return decorationSet;
            return updateHeadingLinkDecorations(tr, decorationSet);
          },
        },
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            const { doc } = state;

            doc.descendants((node, pos) => {
              if (node.type.name === "heading" && node.content.size > 0) {
                const deco = Decoration.widget(
                  pos + node.nodeSize - 1,
                  () => {
                    const icon = document.createElement("span");
                    icon.classList.add("link-btn");
                    icon.innerHTML = "&nbsp;";
                    icon.contentEditable = "false";

                    const linkBtnContent = document.createElement("span");
                    linkBtnContent.classList.add("link-btn-content");
                    linkBtnContent.innerHTML = copyIcon;
                    icon.appendChild(linkBtnContent);

                    icon.addEventListener("mousedown", (e) =>
                      e.preventDefault(),
                    );
                    icon.addEventListener("click", (e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const id = node.attrs.id;
                      const baseUrl = window.location.href.split('#')[0];
                      const url = `${baseUrl}#${id}`;
                      copyToClipboard(url);
                      linkBtnContent.innerHTML = successIcon;
                      setTimeout(
                        () => (linkBtnContent.innerHTML = copyIcon),
                        2000,
                      );
                    });

                    return icon;
                  },
                  { side: 1 }, // render after node content
                );
                decorations.push(deco);
              }
            });

            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    const hasLevel = this.options.levels.includes(node.attrs.level);
    const level = hasLevel ? node.attrs.level : this.options.levels[0];

    return [
      `h${level}`,
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        id: node.attrs.id,
      }),
      0,
    ];
  },
});
