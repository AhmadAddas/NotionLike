"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "../../../lib/api";

export default function InvitationPage() {
  const { token } = useParams<{ token: string }>(); const router = useRouter(); const [invitation, setInvitation] = useState<{ workspaceName: string; email: string; role: string }>(); const [error, setError] = useState("");
  useEffect(() => { void api<{ invitation: { workspaceName: string; email: string; role: string } }>(`/invitations/${token}`).then((result) => setInvitation(result.invitation)).catch((reason) => setError(String(reason))); }, [token]);
  const accept = async () => { try { await api("/invitations/accept", { method: "POST", body: JSON.stringify({ token }) }); router.push("/workspace"); } catch { localStorage.setItem("pendingInvitation", token); router.push("/login"); } };
  return <main className="auth-page"><section className="auth-card"><div className="brand"><span className="brand-mark">N</span> NotionLike</div>{invitation ? <><h1>Join {invitation.workspaceName}</h1><p>This invitation grants <strong>{invitation.role}</strong> access to {invitation.email}.</p><button className="primary-button" onClick={() => void accept()}>Accept invitation</button></> : <><h1>Invitation</h1><p>{error || "Checking your invitation…"}</p></>}</section></main>;
}

