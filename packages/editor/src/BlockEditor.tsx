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
import * as Y from "yjs";

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

export function BlockEditor({ pageId, apiBaseUrl, token, readOnly = false, initialUpdate, onSyncState, user, onPresence }: BlockEditorProps) {
  const document = useMemo(() => new Y.Doc(), [pageId]);
  const sequence = useRef(Number(globalThis.localStorage?.getItem(`nl-sequence-${pageId}`) ?? "0"));
  const clientId = useRef(globalThis.localStorage?.getItem("nl-client-id") ?? crypto.randomUUID());
  const [ready, setReady] = useState(false);
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
      StarterKit.configure({ undoRedo: false, link: false }), Collaboration.configure({ document }),
      Link.configure({ openOnClick: false, autolink: true }), Image.configure({ allowBase64: false }),
      Placeholder.configure({ placeholder: "Type '/' for commands…" }), TaskList, TaskItem.configure({ nested: true }),
    ],
    editable: !readOnly,
    immediatelyRender: false,
  }, [document, readOnly]);

  if (!ready || !editor) return <div className="editor-loading">Loading page…</div>;
  return <div className="block-editor">
    {!readOnly && <div className="editor-toolbar" role="toolbar" aria-label="Text formatting">
      <button onClick={() => editor.chain().focus().toggleBold().run()} aria-pressed={editor.isActive("bold")}><strong>B</strong></button>
      <button onClick={() => editor.chain().focus().toggleItalic().run()} aria-pressed={editor.isActive("italic")}><em>I</em></button>
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} aria-pressed={editor.isActive("heading", { level: 2 })}>H2</button>
      <button onClick={() => editor.chain().focus().toggleBulletList().run()} aria-pressed={editor.isActive("bulletList")}>List</button>
      <button onClick={() => editor.chain().focus().toggleTaskList().run()} aria-pressed={editor.isActive("taskList")}>To-do</button>
      <button onClick={() => editor.chain().focus().toggleCodeBlock().run()} aria-pressed={editor.isActive("codeBlock")}>Code</button>
      <button onClick={() => editor.chain().focus().toggleBlockquote().run()} aria-pressed={editor.isActive("blockquote")}>Quote</button>
    </div>}
    <EditorContent editor={editor} />
  </div>;
}
