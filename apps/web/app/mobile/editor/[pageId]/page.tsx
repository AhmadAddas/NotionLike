"use client";
import { useEffect, useState } from "react";
import { BlockEditor, type SyncState } from "@notionlike/editor";

type Initialization = { type: "initialize"; apiBaseUrl: string; token: string; pageId: string };
declare global { interface Window { ReactNativeWebView?: { postMessage: (message: string) => void } } }

export default function MobileEditor({ params }: { params: Promise<{ pageId: string }> }) {
  const [initialization, setInitialization] = useState<Initialization>();
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      try { const message = JSON.parse(String(event.data)) as Initialization; if (message.type === "initialize") setInitialization(message); } catch { /* Ignore messages from other scripts. */ }
    };
    document.addEventListener("message", receive as EventListener); window.addEventListener("message", receive);
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: "ready" }));
    return () => { document.removeEventListener("message", receive as EventListener); window.removeEventListener("message", receive); };
  }, []);
  const report = (state: SyncState) => window.ReactNativeWebView?.postMessage(JSON.stringify({ type: "sync", state }));
  if (!initialization) return <main className="mobile-editor-loading">Connecting to your page…</main>;
  return <main className="mobile-editor-page"><BlockEditor pageId={initialization.pageId} apiBaseUrl={initialization.apiBaseUrl} token={initialization.token} onSyncState={report} /></main>;
}

