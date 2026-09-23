import { NextResponse } from "next/server";
import {
  AuthError,
  requireRole,
  type AppRole,
  type SessionLike,
} from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { FindingTransitionError } from "@/lib/findings";
import { ScanAllowlistError } from "@/lib/scans";
import { ZodError } from "zod";

export async function requireApiSession() {
  const session = await getSession();
  if (!session?.user) {
    throw new AuthError("Unauthorized", 401);
  }
  return session;
}

export function requireApiRole(
  session: SessionLike,
  roles: readonly AppRole[],
): AppRole {
  return requireRole(session, roles);
}

export function jsonError(err: unknown): NextResponse {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ScanAllowlistError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof FindingTransitionError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: err.flatten(),
      },
      { status: 400 },
    );
  }
  console.error(err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
