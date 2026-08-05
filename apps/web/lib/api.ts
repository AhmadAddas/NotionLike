export const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, { credentials: "include", ...options, headers: { "content-type": "application/json", ...options.headers } });
  const body = response.status === 204 ? undefined : await response.json();
  if (!response.ok) throw new Error(body?.error ?? "Request failed");
  return body as T;
}

