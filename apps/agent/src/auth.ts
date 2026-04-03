import { createRemoteJWKSet, jwtVerify } from "jose";
import type { FastifyRequest, FastifyReply } from "fastify";

// Cached JWKS — fetched once from Keycloak
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!jwks && process.env.KEYCLOAK_ISSUER) {
    const url = new URL(`${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/certs`);
    jwks = createRemoteJWKSet(url);
  }
  return jwks;
}

export interface AuthUser {
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
}

// Extract user from verified JWT — returns null if auth disabled or no token
export async function verifyToken(token: string): Promise<AuthUser | null> {
  const set = getJWKS();
  if (!set) return null; // Keycloak not configured

  try {
    const { payload } = await jwtVerify(token, set, {
      issuer: process.env.KEYCLOAK_ISSUER,
    });
    return payload as AuthUser;
  } catch {
    return null;
  }
}

// Fastify preHandler — attach user to request or return 401
export async function authMiddleware(req: FastifyRequest, reply: FastifyReply) {
  // Bypass if AUTH_ENABLED=false (local dev)
  if (process.env.AUTH_ENABLED === "false") {
    (req as any).user = { sub: "local", name: "Local user", email: "local@dev" };
    return;
  }

  // Bypass if Keycloak not configured
  if (!process.env.KEYCLOAK_ISSUER) {
    (req as any).user = { sub: "anonymous", name: "Anonymous" };
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "Missing token" });
  }

  const token = authHeader.slice(7);
  const user = await verifyToken(token);
  if (!user) {
    return reply.code(401).send({ error: "Invalid token" });
  }

  (req as any).user = user;
}

export function getUser(req: FastifyRequest): AuthUser {
  return (req as any).user ?? { sub: "unknown" };
}
