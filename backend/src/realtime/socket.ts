import type { Server as HttpServer } from "http";

import type { ClientToServerEvents, ServerToClientEvents } from "@social-matching/shared";
import { Server, Socket } from "socket.io";

import env from "../config/env";
import { authenticate } from "../middleware/auth";
import type { CurrentUser } from "../types/express";
import { HttpError } from "../utils/httpError";

interface SocketData {
  user: CurrentUser;
}

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

let io: IoServer | null = null;

// Every socket of a user joins this room, so one emit reaches all their devices.
const userRoom = (userId: string) => `user:${userId}`;

/** What the client sees in `connect_error`: `err.message` and `err.data.error`, like HTTP. */
function toConnectError(err: unknown): Error {
  const known = err instanceof HttpError ? err : HttpError.unauthorized();
  return Object.assign(new Error(known.message), { data: { error: known.code } });
}

export function attachSocketServer(httpServer: HttpServer): IoServer {
  io = new Server(httpServer, { cors: { origin: env.frontendUrls } });

  // The same check as requireUser, once per connection: `io(url, { auth: { token } })`.
  io.use(async (socket, next) => {
    const token: unknown = socket.handshake.auth?.token;

    try {
      if (typeof token !== "string") throw HttpError.unauthorized();
      socket.data.user = await authenticate(token, { path: "socket", ip: socket.handshake.address });
      next();
    } catch (err) {
      next(toConnectError(err));
    }
  });

  io.on("connection", (socket) => {
    void socket.join(userRoom(socket.data.user.id));
  });

  return io;
}

export function closeSocketServer(): Promise<void> {
  return new Promise((resolve) => (io ? io.close(() => resolve()) : resolve()));
}

export function isOnline(userId: string): boolean {
  return (io?.sockets.adapter.rooms.get(userRoom(userId))?.size ?? 0) > 0;
}

export function emitToUser<E extends keyof ServerToClientEvents>(
  userId: string,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
): void {
  io?.to(userRoom(userId)).emit(event, ...args);
}
