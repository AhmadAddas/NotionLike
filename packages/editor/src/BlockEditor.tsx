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
type SlashCommand = { id: string; label: string; description: string; icon: string; group: "Basic" | "Lists" | "Media" | "Advanced"; aliases: string[]; run: () => void };

export function BlockEditor({ pageId, apiBaseUrl, token, readOnly = false, initialUpdate, onSyncState, user, onPresence }: BlockEditorProps) {
  const document = useMemo(() => new Y.Doc(), [pageId]);
  const sequence = useRef(Number(globalThis.localStorage?.getItem(`nl-sequence-${pageId}`) ?? "0"));
  const clientId = useRef(globalThis.localStorage?.getItem("nl-client-id") ?? crypto.randomUUID());
  const [ready, setReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashPosition, setSlashPosition] = useState({ left: 0, top: 0 });
  const slashRange = useRef<{ from: number; to: number } | null>(null);
  const slashCommandsRef = useRef<SlashCommand[]>([]);
  const slashIndexRef = useRef(0);
  const slashMenu = useRef<HTMLDivElement>(null);
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
    onUpdate: ({ editor: current }) => {
      const { from } = current.state.selection;
      const start = Math.max(0, from - 80);
      const before = current.state.doc.textBetween(start, from, "\n", "\0");
      const match = before.match(/(?:^|\s)\/([a-z0-9-]*)$/i);
      if (!match) { setSlashOpen(false); slashRange.current = null; return; }
      const query = match[1] ?? "";
      slashRange.current = { from: from - query.length - 1, to: from };
      const coordinates = current.view.coordsAtPos(from);
      setSlashPosition({ left: coordinates.left, top: coordinates.bottom + 6 });
      setSlashQuery(query); setSlashIndex(0); slashIndexRef.current = 0; setSlashOpen(true);
    },
    editorProps: { handleKeyDown: (_view, event) => {
      if (!slashRange.current && event.key === "/") return false;
      if (!slashRange.current) return false;
      const commands = slashCommandsRef.current;
      if (event.key === "ArrowDown") { event.preventDefault(); const next=(slashIndexRef.current+1)%Math.max(commands.length,1);slashIndexRef.current=next;setSlashIndex(next);return true; }
      if (event.key === "ArrowUp") { event.preventDefault(); const next=(slashIndexRef.current-1+Math.max(commands.length,1))%Math.max(commands.length,1);slashIndexRef.current=next;setSlashIndex(next);return true; }
      if ((event.key === "Enter" || event.key === "Tab") && commands.length) { event.preventDefault(); commands[slashIndexRef.current]?.run(); return true; }
      if (event.key === "Escape") { event.preventDefault(); slashRange.current=null;setSlashOpen(false);return true; }
      return false;
    } },
  }, [document, readOnly]);

  useEffect(() => {
    slashMenu.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [slashIndex, slashQuery]);

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
  const removeSlash = () => { const range=slashRange.current;if(range)editor.chain().focus().deleteRange(range).run();slashRange.current=null;setSlashOpen(false);setSlashQuery(""); };
  const command = (action: () => void) => { removeSlash(); action(); };
  const setLink = () => { const href = prompt("Link URL", editor.getAttributes("link").href ?? "https://"); if (href === null) return; if (!href) editor.chain().focus().unsetLink().run(); else editor.chain().focus().extendMarkRange("link").setLink({ href }).run(); };
  const tableContent={ type:"table",content:Array.from({length:3},(_,row)=>({type:"tableRow",content:Array.from({length:3},()=>({type:row===0?"tableHeader":"tableCell",content:[{type:"paragraph"}]}))})) };
  const commands:SlashCommand[]=[
    {id:"text",label:"Text",description:"Plain paragraph",icon:"¶",group:"Basic",aliases:["paragraph","plain"],run:()=>command(()=>editor.chain().focus().setParagraph().run())},
    ...([1,2,3] as const).map(level=>({id:`heading-${level}`,label:`Heading ${level}`,description:`${level===1?"Large":level===2?"Medium":"Small"} section heading`,icon:`H${level}`,group:"Basic" as const,aliases:[`h${level}`,"title"],run:()=>command(()=>editor.chain().focus().toggleHeading({level}).run())})),
    {id:"bullet",label:"Bulleted list",description:"Create a simple list",icon:"•",group:"Lists",aliases:["ul","unordered"],run:()=>command(()=>editor.chain().focus().toggleBulletList().run())},
    {id:"numbered",label:"Numbered list",description:"Create an ordered list",icon:"1.",group:"Lists",aliases:["ol","ordered"],run:()=>command(()=>editor.chain().focus().toggleOrderedList().run())},
    {id:"todo",label:"To-do list",description:"Track tasks",icon:"☑",group:"Lists",aliases:["task","checkbox"],run:()=>command(()=>editor.chain().focus().toggleTaskList().run())},
    {id:"quote",label:"Quote",description:"Capture a quotation",icon:"❝",group:"Basic",aliases:["blockquote"],run:()=>command(()=>editor.chain().focus().toggleBlockquote().run())},
    {id:"code",label:"Code",description:"Syntax-highlighted code block",icon:"</>",group:"Basic",aliases:["pre","snippet"],run:()=>command(()=>editor.chain().focus().toggleCodeBlock().run())},
    {id:"divider",label:"Divider",description:"Separate sections",icon:"—",group:"Basic",aliases:["hr","line"],run:()=>command(()=>editor.chain().focus().setHorizontalRule().run())},
    {id:"table",label:"Table",description:"Insert a 3 × 3 table",icon:"▦",group:"Advanced",aliases:["grid"],run:()=>command(()=>editor.chain().focus().insertContent(tableContent).run())},
    {id:"callout",label:"Callout",description:"Emphasize information",icon:"💡",group:"Advanced",aliases:["note","info"],run:()=>command(()=>editor.chain().focus().insertContent({type:"callout",content:[{type:"paragraph"}]}).run())},
    {id:"toggle",label:"Toggle",description:"Collapsible content",icon:"▶",group:"Advanced",aliases:["details","collapse"],run:()=>command(()=>editor.chain().focus().insertContent({type:"toggleBlock",attrs:{summary:"Toggle"},content:[{type:"paragraph"}]}).run())},
    {id:"image",label:"Image",description:"Upload and display an image",icon:"▧",group:"Media",aliases:["photo","picture","upload"],run:()=>{removeSlash();fileInput.current?.click()}},
    {id:"pdf",label:"PDF",description:"Upload and preview a PDF",icon:"PDF",group:"Media",aliases:["document","upload"],run:()=>{removeSlash();fileInput.current?.click()}},
    {id:"file",label:"File",description:"Upload a downloadable attachment",icon:"📎",group:"Media",aliases:["attachment","upload"],run:()=>{removeSlash();fileInput.current?.click()}},
  ];
  const normalized=slashQuery.toLowerCase();const filtered=commands.filter(item=>!normalized||[item.label,item.id,...item.aliases].some(value=>value.toLowerCase().includes(normalized)));
  const activeIndex=Math.min(slashIndex,Math.max(filtered.length-1,0));slashCommandsRef.current=filtered;slashIndexRef.current=activeIndex;
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
    {slashOpen && !readOnly && <div ref={slashMenu} className="slash-menu" role="menu" aria-label="Insert block" style={slashPosition}>
      <div className="slash-menu-query"><span>/</span>{slashQuery || "Type to filter"}</div>
      {filtered.length ? (["Basic","Lists","Media","Advanced"] as const).map(group => {
        const items=filtered.filter(item=>item.group===group);if(!items.length)return null;
        return <div className="slash-menu-group" key={group}><strong>{group}</strong>{items.map(item=>{
          const index=filtered.indexOf(item);return <button key={item.id} role="menuitem" aria-selected={index===activeIndex}
            onMouseDown={event=>event.preventDefault()} onMouseEnter={()=>{slashIndexRef.current=index;setSlashIndex(index)}} onClick={item.run}>
            <span>{item.icon}</span><div>{item.label}<small>{item.description}</small></div>
          </button>;
        })}</div>;
      }) : <div className="slash-menu-empty">No commands match “{slashQuery}”</div>}
      <div className="slash-menu-footer"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>Enter</kbd> select</span><span><kbd>Esc</kbd> close</span></div>
    </div>}
    <EditorContent editor={editor} />
  </div>;
}
