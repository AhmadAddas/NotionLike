import { Mark, Node, mergeAttributes } from "@tiptap/core";

export const HighlightMark = Mark.create({ name: "highlight", parseHTML: () => [{ tag: "mark" }], renderHTML: ({ HTMLAttributes }) => ["mark", mergeAttributes(HTMLAttributes, { class: "text-highlight" }), 0] });
export const TableNode = Node.create({ name: "table", group: "block", content: "tableRow+", isolating: true, parseHTML: () => [{ tag: "table" }], renderHTML: () => ["div", { class: "table-scroll" }, ["table", ["tbody", 0]]] });
export const TableRow = Node.create({ name: "tableRow", content: "(tableHeader|tableCell)+", parseHTML: () => [{ tag: "tr" }], renderHTML: () => ["tr", 0] });
export const TableHeader = Node.create({ name: "tableHeader", content: "block+", isolating: true, parseHTML: () => [{ tag: "th" }], renderHTML: () => ["th", 0] });
export const TableCell = Node.create({ name: "tableCell", content: "block+", isolating: true, parseHTML: () => [{ tag: "td" }], renderHTML: () => ["td", 0] });

export const Callout = Node.create({
  name: "callout", group: "block", content: "block+", defining: true,
  addAttributes: () => ({ emoji: { default: "💡" }, tone: { default: "gray" } }),
  parseHTML: () => [{ tag: "aside[data-callout]" }],
  renderHTML: ({ HTMLAttributes }) => ["aside", mergeAttributes(HTMLAttributes, { "data-callout": "" }), ["span", { class: "callout-emoji", contenteditable: "false" }, HTMLAttributes.emoji], ["div", { class: "callout-content" }, 0]],
});

export const ToggleBlock = Node.create({
  name: "toggleBlock", group: "block", content: "block+", defining: true,
  addAttributes: () => ({ summary: { default: "Toggle" }, open: { default: false } }),
  parseHTML: () => [{ tag: "details[data-toggle]" }],
  renderHTML: ({ HTMLAttributes }) => ["details", mergeAttributes({ "data-toggle": "" }, HTMLAttributes.open ? { open: "" } : {}), ["summary", { contenteditable: "false" }, HTMLAttributes.summary], ["div", { class: "toggle-content" }, 0]],
});

export const FileAttachment = Node.create({
  name: "fileAttachment", group: "block", atom: true, draggable: true,
  addAttributes: () => ({ src: { default: null }, name: { default: "Attachment" }, mime: { default: "application/octet-stream" }, size: { default: 0 } }),
  parseHTML: () => [{ tag: "figure[data-file-attachment]" }],
  renderHTML: ({ HTMLAttributes }) => HTMLAttributes.mime === "application/pdf"
    ? ["figure", { "data-file-attachment": "", class: "file-attachment" }, ["iframe", { src: HTMLAttributes.src, title: HTMLAttributes.name, loading: "lazy" }], ["figcaption", {}, `PDF · ${HTMLAttributes.name}`]]
    : ["figure", { "data-file-attachment": "", class: "file-attachment" }, ["a", { href: HTMLAttributes.src, target: "_blank", rel: "noopener noreferrer", download: HTMLAttributes.name }, `📎 ${HTMLAttributes.name}`]],
});

export const MediaBlock = Node.create({
  name: "mediaBlock", group: "block", atom: true, draggable: true,
  addAttributes: () => ({ src: { default: null }, kind: { default: "video" }, title: { default: "Media" } }),
  parseHTML: () => [{ tag: "figure[data-media-block]" }],
  renderHTML: ({ HTMLAttributes }) => ["figure", { "data-media-block": "", "data-kind": HTMLAttributes.kind, class: "media-block" },
    HTMLAttributes.kind === "audio"
      ? ["audio", { src: HTMLAttributes.src, controls: "", preload: "metadata" }]
      : ["video", { src: HTMLAttributes.src, controls: "", preload: "metadata" }],
    ["figcaption", {}, HTMLAttributes.title]],
});

export const BookmarkBlock = Node.create({
  name: "bookmarkBlock", group: "block", atom: true, draggable: true,
  addAttributes: () => ({ href: { default: null }, title: { default: "Bookmark" } }),
  parseHTML: () => [{ tag: "a[data-bookmark]" }],
  renderHTML: ({ HTMLAttributes }) => ["a", { "data-bookmark": "", class: "bookmark-block", href: HTMLAttributes.href, target: "_blank", rel: "noopener noreferrer" }, ["strong", {}, HTMLAttributes.title], ["small", {}, HTMLAttributes.href]],
});

export const EmbedBlock = Node.create({
  name: "embedBlock", group: "block", atom: true, draggable: true,
  addAttributes: () => ({ src: { default: null }, title: { default: "Embedded content" } }),
  parseHTML: () => [{ tag: "figure[data-embed-block]" }],
  renderHTML: ({ HTMLAttributes }) => ["figure", { "data-embed-block": "", class: "embed-block" }, ["iframe", { src: HTMLAttributes.src, title: HTMLAttributes.title, loading: "lazy", sandbox: "allow-scripts allow-same-origin allow-popups allow-forms", referrerpolicy: "no-referrer" }], ["figcaption", {}, HTMLAttributes.title]],
});
