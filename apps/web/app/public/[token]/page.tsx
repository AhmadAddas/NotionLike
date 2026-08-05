import { BlockEditor } from "@notionlike/editor";
const apiUrl = process.env.API_URL ?? "http://localhost:4000/api/v1";
export default async function PublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const response = await fetch(`${apiUrl}/public/${token}`, { cache: "no-store" });
  if (!response.ok) return <main className="public-page"><h1>Page not found</h1><p>This link may have been revoked.</p></main>;
  const result = await response.json() as { page: { id: string; title: string; icon: string | null }; update: string };
  return <main className="public-page"><div className="brand small"><span className="brand-mark">N</span> NotionLike</div><article><div className="public-icon">{result.page.icon ?? "📄"}</div><h1>{result.page.title}</h1><BlockEditor pageId={result.page.id} apiBaseUrl={apiUrl} initialUpdate={result.update} readOnly /></article></main>;
}

