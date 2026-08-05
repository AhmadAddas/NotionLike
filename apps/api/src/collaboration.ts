import type { FastifyInstance } from "fastify";
import { authenticate } from "./auth.js";
import { pageAccess } from "./db.js";

type Peer = { socket: WebSocket; user: { id: string; name: string } };
const rooms = new Map<string, Set<Peer>>();

export async function registerCollaboration(app: FastifyInstance) {
  app.get("/api/v1/pages/:pageId/live", { websocket: true, preValidation: authenticate }, (socket, request) => {
    const { pageId } = request.params as { pageId: string };
    const peer: Peer = { socket: socket as unknown as WebSocket, user: request.user };
    void pageAccess(request.user.id, pageId).then((allowed) => {
      if (!allowed) { socket.close(1008, "Forbidden"); return; }
      const room = rooms.get(pageId) ?? new Set<Peer>(); rooms.set(pageId, room); room.add(peer);
      const broadcast = (payload: unknown, except?: Peer) => {
        const encoded = JSON.stringify(payload);
        for (const member of room) if (member !== except && member.socket.readyState === 1) member.socket.send(encoded);
      };
      broadcast({ type: "presence", action: "join", user: peer.user }, peer);
      socket.on("message", (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as { type: string; update?: string; presence?: unknown };
          if (message.type === "update" && typeof message.update === "string") broadcast({ type: "update", update: message.update, userId: peer.user.id }, peer);
          if (message.type === "presence") broadcast({ type: "presence", action: "update", user: peer.user, presence: message.presence }, peer);
        } catch { socket.send(JSON.stringify({ type: "error", error: "Invalid collaboration message" })); }
      });
      socket.on("close", () => { room.delete(peer); broadcast({ type: "presence", action: "leave", user: peer.user }); if (!room.size) rooms.delete(pageId); });
    });
  });
}
