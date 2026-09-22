import { NextResponse } from "next/server";
import {
  deleteAllowlistTarget,
  getAllowlistById,
  updateAllowlistSchema,
  updateAllowlistTarget,
  validateAllowlistPattern,
} from "@/lib/allowlist";
import {
  jsonError,
  requireApiRole,
  requireApiSession,
} from "@/lib/api/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requireApiSession();
    requireApiRole(session, ["admin"]);

    const { id } = await context.params;
    const existing = await getAllowlistById(id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateAllowlistSchema.parse(body);

    const nextType = parsed.type ?? existing.type;
    const nextPattern = parsed.pattern ?? existing.pattern;
    const patternError = validateAllowlistPattern(nextType, nextPattern);
    if (patternError) {
      return NextResponse.json(
        { error: "Validation failed", details: { pattern: patternError } },
        { status: 400 },
      );
    }

    const item = await updateAllowlistTarget(id, parsed);
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(item);
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const session = await requireApiSession();
    requireApiRole(session, ["admin"]);

    const { id } = await context.params;
    const ok = await deleteAllowlistTarget(id);
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return jsonError(err);
  }
}
