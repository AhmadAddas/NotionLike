"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";

export default function LoginPage() {
  const router = useRouter(); const [register, setRegister] = useState(false); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget);
    try {
      await api(register ? "/auth/register" : "/auth/login", { method: "POST", body: JSON.stringify({ name: data.get("name"), email: data.get("email"), password: data.get("password") }) });
      router.push("/workspace");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to sign in"); } finally { setBusy(false); }
  };
  return <main className="auth-page"><section className="auth-card">
    <div className="brand"><span className="brand-mark">N</span> NotionLike</div>
    <h1>{register ? "Create your workspace" : "Welcome back"}</h1>
    <p>{register ? "Notes, projects, and knowledge—on your server." : "Sign in to continue to your workspace."}</p>
    <form onSubmit={submit}>
      {register && <label>Name<input name="name" autoComplete="name" required maxLength={80} /></label>}
      <label>Email<input name="email" type="email" autoComplete="email" required /></label>
      <label>Password<input name="password" type="password" autoComplete={register ? "new-password" : "current-password"} required minLength={register ? 10 : 1} /></label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="primary-button" disabled={busy}>{busy ? "Please wait…" : register ? "Create account" : "Sign in"}</button>
    </form>
    <button className="text-button" onClick={() => { setRegister(!register); setError(""); }}>{register ? "Already have an account? Sign in" : "New here? Create an account"}</button>
  </section></main>;
}

