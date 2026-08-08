"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Underline from "@tiptap/extension-underline";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import * as Y from "yjs";
import { Callout, FileAttachment, HighlightMark, TableCell, TableHeader, TableNode, TableRow, ToggleBlock } from "./extensions";

export type SyncState = "loading" | "offline" | "saving" | "saved" | "error";
export type BlockEditorProps = {
  pageId: string;
  apiBaseUrl: string;
  token?: string;
  readOnly?: boolean;
  initialUpdate?: string;
  onSyncState?: (state: SyncState) => void;
  user?: { id: string; name: string };
  onPresence?: (users: Array<{ id: string; name: string }>) => void;
};

const fromBase64 = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
const toBase64 = (value: Uint8Array) => {
  let binary = "";
  value.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};
const lowlight = createLowlight(common);

export function BlockEditor({ pageId, apiBaseUrl, token, readOnly = false, initialUpdate, onSyncState, user, onPresence }: BlockEditorProps) {
  const document = useMemo(() => new Y.Doc(), [pageId]);
  const sequence = useRef(Number(globalThis.localStorage?.getItem(`nl-sequence-${pageId}`) ?? "0"));
  const clientId = useRef(globalThis.localStorage?.getItem("nl-client-id") ?? crypto.randomUUID());
  const [ready, setReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const headers = useMemo(() => token ? { Authorization: `Bearer ${token}` } : undefined, [token]);

  useEffect(() => {
    globalThis.localStorage?.setItem("nl-client-id", clientId.current);
    let persistence: import("y-indexeddb").IndexeddbPersistence | undefined;
    let cancelled = false;
    const load = async () => {
      onSyncState?.("loading");
      if (initialUpdate) Y.applyUpdate(document, fromBase64(initialUpdate), "remote");
      if (!readOnly && typeof indexedDB !== "undefined") {
        const { IndexeddbPersistence } = await import("y-indexeddb");
        persistence = new IndexeddbPersistence(`notionlike-${pageId}`, document);
        await persistence.whenSynced;
      }
      if (!readOnly && navigator.onLine) {
        try {
          const response = await fetch(`${apiBaseUrl}/pages/${pageId}/document`, { credentials: "include", headers });
          if (response.ok) {
            const body = await response.json() as { update: string };
            if (body.update) Y.applyUpdate(document, fromBase64(body.update), "remote");
          }
        } catch { onSyncState?.("offline"); }
      }
      if (!cancelled) { setReady(true); onSyncState?.(navigator.onLine ? "saved" : "offline"); }
    };
    void load();
    return () => { cancelled = true; persistence?.destroy(); document.destroy(); };
  }, [apiBaseUrl, document, headers, initialUpdate, onSyncState, pageId, readOnly]);

  useEffect(() => {
    if (readOnly) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: Uint8Array[] = [];
    const flush = async () => {
      if (!pending.length) return;
      if (!navigator.onLine) { onSyncState?.("offline"); return; }
      const update = Y.mergeUpdates(pending); pending = [];
      const nextSequence = ++sequence.current;
      globalThis.localStorage?.setItem(`nl-sequence-${pageId}`, String(nextSequence));
      onSyncState?.("saving");
      try {
        const response = await fetch(`${apiBaseUrl}/pages/${pageId}/document`, {
          method: "POST", credentials: "include", headers: { "content-type": "application/json", ...headers },
          body: JSON.stringify({ update: toBase64(update), clientId: clientId.current, sequence: nextSequence }),
        });
        if (!response.ok) throw new Error("Sync rejected");
        onSyncState?.("saved");
      } catch { pending.unshift(update); onSyncState?.(navigator.onLine ? "error" : "offline"); }
    };
    const updateHandler = (update: Uint8Array, origin: unknown) => {
      if (origin === "remote") return;
      pending.push(update); onSyncState?.("saving");
      clearTimeout(timer); timer = setTimeout(() => void flush(), 700);
    };
    const onlineHandler = () => void flush();
    document.on("update", updateHandler); window.addEventListener("online", onlineHandler);
    return () => { clearTimeout(timer); document.off("update", updateHandler); window.removeEventListener("online", onlineHandler); void flush(); };
  }, [apiBaseUrl, document, headers, onSyncState, pageId, readOnly]);

  useEffect(() => {
    if (readOnly || typeof WebSocket === "undefined") return;
    const peers = new Map<string, { id: string; name: string }>();
    const base = apiBaseUrl.replace(/^http/, "ws");
    const url = `${base}/pages/${pageId}/live${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    const socket = new WebSocket(url);
    const updateHandler = (update: Uint8Array, origin: unknown) => {
      if (origin !== "remote" && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "update", update: toBase64(update) }));
    };
    socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "presence", presence: { editing: true, name: user?.name } })));
    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data)) as { type: string; update?: string; action?: string; user?: { id: string; name: string } };
        if (message.type === "update" && message.update) Y.applyUpdate(document, fromBase64(message.update), "remote");
        if (message.type === "presence" && message.user) {
          if (message.action === "leave") peers.delete(message.user.id); else peers.set(message.user.id, message.user);
          onPresence?.([...peers.values()]);
        }
      } catch { /* Ignore malformed peer messages. */ }
    });
    document.on("update", updateHandler);
    return () => { document.off("update", updateHandler); socket.close(); onPresence?.([]); };
  }, [apiBaseUrl, document, onPresence, pageId, readOnly, token, user?.name]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ undoRedo: false, link: false, codeBlock: false }), Collaboration.configure({ document }),
      Link.configure({ openOnClick: false, autolink: true }), Image.configure({ allowBase64: false }),
      Placeholder.configure({ placeholder: "Type '/' for commands…" }), TaskList, TaskItem.configure({ nested: true }),
      Underline, HighlightMark, TableNode, TableRow, TableHeader, TableCell,
      CodeBlockLowlight.configure({ lowlight }), Callout, ToggleBlock, FileAttachment,
    ],
    editable: !readOnly,
    immediatelyRender: false,
    editorProps: { handleKeyDown: (_view, event) => { if (event.key === "/") setSlashOpen(true); if (event.key === "Escape") setSlashOpen(false); return false; } },
  }, [document, readOnly]);

  const uploadFile = async (file: File) => {
    if (!editor || file.size > 25_000_000) { onSyncState?.("error"); return; }
    setUploading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/pages/${pageId}/attachments/presign`, {
        method: "POST", credentials: "include", headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ fileName: file.name, contentType: file.type || "application/octet-stream", size: file.size }),
      });
      if (!response.ok) throw new Error("Upload could not be prepared");
      const target = await response.json() as { uploadUrl: string; publicUrl: string };
      const upload = await fetch(target.uploadUrl, { method: "PUT", headers: { "content-type": file.type || "application/octet-stream" }, body: file });
      if (!upload.ok) throw new Error("Upload failed");
      if (file.type.startsWith("image/")) editor.chain().focus().setImage({ src: target.publicUrl, alt: file.name, title: file.name }).run();
      else editor.chain().focus().insertContent({ type: "fileAttachment", attrs: { src: target.publicUrl, name: file.name, mime: file.type, size: file.size } }).run();
      onSyncState?.("saving");
    } catch { onSyncState?.("error"); }
    finally { setUploading(false); if (fileInput.current) fileInput.current.value = ""; }
  };

  if (!ready || !editor) return <div className="editor-loading">Loading page…</div>;
  const removeSlash = () => { const { from } = editor.state.selection; if (from > 0 && editor.state.doc.textBetween(from - 1, from) === "/") editor.chain().focus().deleteRange({ from: from - 1, to: from }).run(); setSlashOpen(false); };
  const command = (action: () => void) => { removeSlash(); action(); };
  const setLink = () => { const href = prompt("Link URL", editor.getAttributes("link").href ?? "https://"); if (href === null) return; if (!href) editor.chain().focus().unsetLink().run(); else editor.chain().focus().extendMarkRange("link").setLink({ href }).run(); };
  return <div className="block-editor">
    {!readOnly && <div className="editor-toolbar" role="toolbar" aria-label="Text formatting">
      <button onClick={() => editor.chain().focus().toggleBold().run()} aria-pressed={editor.isActive("bold")}><strong>B</strong></button>
      <button onClick={() => editor.chain().focus().toggleItalic().run()} aria-pressed={editor.isActive("italic")}><em>I</em></button>
      <button onClick={() => editor.chain().focus().toggleUnderline().run()} aria-pressed={editor.isActive("underline")}><u>U</u></button>
      <button onClick={() => editor.chain().focus().toggleMark("highlight").run()} aria-pressed={editor.isActive("highlight")}>Highlight</button>
      <button onClick={setLink} aria-pressed={editor.isActive("link")}>Link</button>
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} aria-pressed={editor.isActive("heading", { level: 2 })}>H2</button>
      <button onClick={() => editor.chain().focus().toggleBulletList().run()} aria-pressed={editor.isActive("bulletList")}>List</button>
      <button onClick={() => editor.chain().focus().toggleTaskList().run()} aria-pressed={editor.isActive("taskList")}>To-do</button>
      <button onClick={() => editor.chain().focus().toggleCodeBlock().run()} aria-pressed={editor.isActive("codeBlock")}>Code</button>
      <button onClick={() => editor.chain().focus().toggleBlockquote().run()} aria-pressed={editor.isActive("blockquote")}>Quote</button>
      <button onClick={() => editor.chain().focus().setHorizontalRule().run()}>Divider</button>
      <button disabled={uploading} onClick={() => fileInput.current?.click()}>{uploading ? "Uploading…" : "File / PDF"}</button>
      <input ref={fileInput} hidden type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file); }} />
    </div>}
    {slashOpen && !readOnly && <div className="slash-menu" role="menu"><strong>Basic blocks</strong>
      <button onClick={() => command(() => editor.chain().focus().setParagraph().run())}><span>¶</span><div>Text<small>Plain paragraph</small></div></button>
      <button onClick={() => command(() => editor.chain().focus().toggleHeading({ level: 1 }).run())}><span>H1</span><div>Heading 1<small>Large section heading</small></div></button>
      <button onClick={() => command(() => editor.chain().focus().toggleBulletList().run())}><span>•</span><div>Bulleted list<small>Create a simple list</small></div></button>
      <button onClick={() => command(() => editor.chain().focus().toggleTaskList().run())}><span>☑</span><div>To-do list<small>Track a task</small></div></button>
      <button onClick={() => command(() => editor.chain().focus().setHorizontalRule().run())}><span>—</span><div>Divider<small>Separate sections</small></div></button>
      <button onClick={() => command(() => editor.chain().focus().insertContent({ type: "table", content: Array.from({ length: 3 }, (_, row) => ({ type: "tableRow", content: Array.from({ length: 3 }, () => ({ type: row === 0 ? "tableHeader" : "tableCell", content: [{ type: "paragraph" }] })) })) }).run())}><span>▦</span><div>Table<small>Insert a simple table</small></div></button>
      <button onClick={() => command(() => editor.chain().focus().insertContent({ type: "callout", content: [{ type: "paragraph" }] }).run())}><span>💡</span><div>Callout<small>Emphasize information</small></div></button>
      <button onClick={() => command(() => editor.chain().focus().insertContent({ type: "toggleBlock", attrs: { summary: "Toggle" }, content: [{ type: "paragraph" }] }).run())}><span>▶</span><div>Toggle<small>Collapsible content</small></div></button>
      <button onClick={() => { removeSlash(); fileInput.current?.click(); }}><span>📎</span><div>File or PDF<small>Upload an attachment</small></div></button>
    </div>}
    <EditorContent editor={editor} />
  </div>;
}
