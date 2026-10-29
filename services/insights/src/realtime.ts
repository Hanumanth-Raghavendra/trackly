import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { TokenVerifier } from './auth.js';
import { logger } from './logger.js';

/** Push channel to a user's open tabs and devices. */
export interface Realtime {
  emitToUser(userId: string, event: string, payload: unknown): void;
  isOnline(userId: string): boolean;
  connectedCount(): number;
}

export const nullRealtime: Realtime = {
  emitToUser: () => undefined,
  isOnline: () => false,
  connectedCount: () => 0,
};

const room = (userId: string) => `user:${userId}`;

/**
 * Socket.IO server. Clients authenticate with their access token in the handshake and join a
 * private room per user, so every tab and device of that user gets the same live updates.
 */
export function attachRealtime(httpServer: HttpServer, verify: TokenVerifier, corsOrigins: string[]) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: corsOrigins, credentials: true },
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string') throw new Error('missing token');
      socket.data.user = await verify(token);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId: string = socket.data.user.id;
    void socket.join(room(userId));
    logger.debug({ userId }, 'socket connected');
  });

  const realtime: Realtime = {
    emitToUser: (userId, event, payload) => {
      io.to(room(userId)).emit(event, payload);
    },
    isOnline: (userId) => (io.sockets.adapter.rooms.get(room(userId))?.size ?? 0) > 0,
    connectedCount: () => io.engine.clientsCount,
  };
  return { io, realtime };
}
