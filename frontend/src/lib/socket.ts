import type { ClientToServerEvents, ServerToClientEvents } from "@social-matching/shared";
import { io, type Socket } from "socket.io-client";

import { getAccessToken } from "./api";
import { config } from "./config";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** `auth` is a function, so every reconnect sends the current token, not the first one. */
export function connectSocket(): AppSocket {
  return io(config.apiUrl, {
    auth: (send) => send({ token: getAccessToken() }),
    transports: ["websocket"],
  });
}
