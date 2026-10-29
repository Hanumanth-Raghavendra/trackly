import type { NextFunction, Request, Response } from 'express';
import { jwtVerify } from 'jose';
import { timingSafeEqual } from 'node:crypto';
import { safeZone } from './domain/dates.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  timezone: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export type TokenVerifier = (token: string) => Promise<AuthUser>;

/**
 * Verifies access tokens issued by the core API (HS256, shared secret). The insights service
 * never talks to the core API to authenticate a request — the signature is enough.
 */
export function createTokenVerifier(secret: string, issuer: string): TokenVerifier {
  const key = new TextEncoder().encode(secret);
  return async (token: string) => {
    const { payload } = await jwtVerify(token, key, {
      issuer,
      audience: 'trackly',
      algorithms: ['HS256'],
    });
    if (typeof payload.sub !== 'string') throw new Error('token has no subject');
    return {
      id: payload.sub,
      email: String(payload.email ?? ''),
      name: String(payload.name ?? ''),
      timezone: safeZone(typeof payload.tz === 'string' ? payload.tz : 'UTC'),
    };
  };
}

export function requireUser(verify: TokenVerifier) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json(problem(401, 'UNAUTHORIZED', 'Sign in to continue'));
      return;
    }
    try {
      req.user = await verify(header.slice(7).trim());
      next();
    } catch {
      res.status(401).json(problem(401, 'UNAUTHORIZED', 'Session expired, please sign in again'));
    }
  };
}

/** Guards service-to-service endpoints (outbox nudge, external cron) with a shared token. */
export function requireServiceToken(expected: string) {
  const expectedBuf = Buffer.from(expected);
  return (req: Request, res: Response, next: NextFunction) => {
    const got = Buffer.from(String(req.headers['x-service-token'] ?? ''));
    if (got.length !== expectedBuf.length || !timingSafeEqual(got, expectedBuf)) {
      res.status(401).json(problem(401, 'UNAUTHORIZED', 'Invalid service token'));
      return;
    }
    next();
  };
}

export function problem(status: number, code: string, detail: string, extra: Record<string, unknown> = {}) {
  return {
    type: `https://trackly.dev/problems/${code.toLowerCase().replaceAll('_', '-')}`,
    status,
    detail,
    code,
    ...extra,
  };
}
