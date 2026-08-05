"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ChevronRight, FileText, LogOut, Menu, MessageSquare, Plus, Search, Share2, Star, WifiOff, X } from "lucide-react";
import type { Page, User, Workspace } from "@notionlike/contracts";
import { BlockEditor, type SyncState } from "@notionlike/editor";
import { api, apiBase } from "../../lib/api";
import { AccessPanel, CommentsPanel, NotificationButton } from "./collaboration-panels";

type PageTreeProps = { pages: Page[]; parentId: string | null; active: string | null; onSelect: (id: string) => void; onCreate: (parentId: string | null) => void };
function PageTree({ pages, parentId, active, onSelect, onCreate }: PageTreeProps) {
  return <>{pages.filter((page) => page.parentId === parentId && !page.archived).map((page) => <div key={page.id}>
    <div className={`page-row ${active === page.id ? "active" : ""}`} onClick={() => onSelect(page.id)}>
      <ChevronRight size={14} /><span>{page.icon ?? "📄"}</span><span className="page-label">{page.title || "Untitled"}</span>
      <button title="Add child page" onClick={(event) => { event.stopPropagation(); onCreate(page.id); }}><Plus size={14} /></button>
    </div>
    <div className="page-children"><PageTree pages={pages} parentId={page.id} active={active} onSelect={onSelect} onCreate={onCreate} /></div>
  </div>)}</>;
}

export default function WorkspaceApp() {
  const [user, setUser] = useState<User>(); const [workspaces, setWorkspaces] = useState<Workspace[]>([]); const [workspaceId, setWorkspaceId] = useState("");
  const [pages, setPages] = useState<Page[]>([]); const [pageId, setPageId] = useState<string | null>(null); const [sync, setSync] = useState<SyncState>("loading");
  const [collaborators, setCollaborators] = useState<Array<{ id: string; name: string }>>([]);
  const [sidebar, setSidebar] = useState(true); const [searchOpen, setSearchOpen] = useState(false); const [query, setQuery] = useState(""); const [error, setError] = useState("");
  const [panel, setPanel] = useState<"comments" | "access" | null>(null);
  const activePage = useMemo(() => pages.find((page) => page.id === pageId), [pages, pageId]);
  const loadPages = useCallback(async (id: string) => { const result = await api<{ pages: Page[] }>(`/workspaces/${id}/pages`); setPages(result.pages); setPageId((current) => current ?? result.pages.find((page) => !page.parentId && !page.archived)?.id ?? null); }, []);
  useEffect(() => { void Promise.all([api<{ user: User }>("/auth/me"), api<{ workspaces: Workspace[] }>("/workspaces")]).then(([me, result]) => { setUser(me.user); setWorkspaces(result.workspaces); const id = result.workspaces[0]?.id; if (id) { setWorkspaceId(id); void loadPages(id); } }).catch(() => location.assign("/login")); }, [loadPages]);
  const createPage = async (parentId: string | null = null) => { try { const result = await api<{ page: Page }>("/pages", { method: "POST", body: JSON.stringify({ workspaceId, parentId, title: "Untitled" }) }); setPages((current) => [...current, result.page]); setPageId(result.page.id); } catch (reason) { setError(String(reason)); } };
  const updatePage = async (patch: Partial<Page>) => { if (!activePage) return; try { const result = await api<{ page: Page }>(`/pages/${activePage.id}`, { method: "PATCH", body: JSON.stringify({ ...patch, revision: activePage.revision }) }); setPages((current) => current.map((page) => page.id === result.page.id ? result.page : page)); } catch { await loadPages(workspaceId); setError("This page changed on another device. The latest version was loaded."); } };
  const share = async () => { if (!activePage) return; const result = await api<{ url: string }>(`/pages/${activePage.id}/public-share`, { method: "POST" }); await navigator.clipboard.writeText(result.url); setError("Public read-only link copied to clipboard."); };
  const results = query ? pages.filter((page) => page.title.toLowerCase().includes(query.toLowerCase()) && !page.archived) : [];
  return <main className="workspace-shell">
    <aside className={`sidebar ${sidebar ? "open" : ""}`}>
      <div className="workspace-switcher"><span className="avatar">{workspaces.find((workspace) => workspace.id === workspaceId)?.name[0] ?? "N"}</span><select value={workspaceId} onChange={(event) => { setWorkspaceId(event.target.value); setPageId(null); void loadPages(event.target.value); }}>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select><button onClick={() => setSidebar(false)} className="mobile-only"><X size={18} /></button></div>
      <nav className="sidebar-nav"><button onClick={() => setSearchOpen(true)}><Search size={17} /> Search <kbd>⌘K</kbd></button><button onClick={() => void createPage()}><Plus size={17} /> New page</button></nav>
      <div className="sidebar-heading">Pages</div><div className="page-tree"><PageTree pages={pages} parentId={null} active={pageId} onSelect={setPageId} onCreate={(id) => void createPage(id)} /></div>
      <div className="sidebar-footer"><span className="avatar subtle">{user?.name[0]}</span><span>{user?.name}</span><button title="Sign out" onClick={() => void api("/auth/logout", { method: "POST" }).finally(() => location.assign("/login"))}><LogOut size={16} /></button></div>
    </aside>
    <section className="workspace-main">
      <header className="topbar"><button className="icon-button" onClick={() => setSidebar(true)}><Menu size={19} /></button><span className="crumb">{activePage?.icon ?? <FileText size={16} />} {activePage?.title ?? "Workspace"}</span><div className="topbar-actions">{collaborators.map((person) => <span key={person.id} className="presence-avatar" title={`${person.name} is viewing`}>{person.name[0]}</span>)}{sync === "offline" && <span className="sync-state"><WifiOff size={14} /> Offline</span>}{sync === "saving" && <span className="sync-state">Saving…</span>}<NotificationButton />{activePage && <><button className="icon-button" title="Comments" onClick={() => setPanel(panel === "comments" ? null : "comments")}><MessageSquare size={18} /></button><button className="icon-button" title="Favorite" onClick={() => void updatePage({ favorite: !activePage.favorite })}><Star size={18} fill={activePage.favorite ? "currentColor" : "none"} /></button><button className="share-button" onClick={() => setPanel(panel === "access" ? null : "access")}><Share2 size={16} /> Share</button><button className="text-button compact" onClick={() => void share()}>Public link</button></>}</div></header>
      {activePage ? <article className="page-canvas"><div className="page-actions"><button onClick={() => void updatePage({ archived: true })}><Archive size={14} /> Move to trash</button></div><input className="page-title" value={activePage.title} placeholder="Untitled" onChange={(event) => setPages((current) => current.map((page) => page.id === activePage.id ? { ...page, title: event.target.value } : page))} onBlur={(event) => void updatePage({ title: event.target.value })} /><BlockEditor key={activePage.id} pageId={activePage.id} apiBaseUrl={apiBase} user={user} onPresence={setCollaborators} onSyncState={setSync} /></article> : <div className="empty-state"><div>✦</div><h1>Your workspace is ready</h1><p>Create a page and start writing.</p><button className="primary-button" onClick={() => void createPage()}><Plus size={17} /> New page</button></div>}
    </section>
    {activePage && panel === "comments" && <CommentsPanel page={activePage} onClose={() => setPanel(null)} />}
    {activePage && panel === "access" && workspaces.find((item) => item.id === workspaceId) && <AccessPanel workspace={workspaces.find((item) => item.id === workspaceId)!} page={activePage} onClose={() => setPanel(null)} />}
    {searchOpen && <div className="modal-backdrop" onClick={() => setSearchOpen(false)}><section className="search-modal" onClick={(event) => event.stopPropagation()}><div className="search-input"><Search size={19} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages…" /></div><div className="search-results">{results.map((page) => <button key={page.id} onClick={() => { setPageId(page.id); setSearchOpen(false); }}><span>{page.icon ?? "📄"}</span><span>{page.title}</span></button>)}{query && !results.length && <p>No pages found</p>}</div></section></div>}
    {error && <button className="toast" onClick={() => setError("")}>{error}</button>}
  </main>;
}
