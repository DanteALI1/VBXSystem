import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";

/**
 * Resolve acting user for mutations while Auth agent lands.
 * Prefer X-User-Id header, else bootstrap admin email, else first user.
 */
export async function resolveActorUserId(
  request: Request,
): Promise<string | null> {
  const headerId = request.headers.get("x-user-id");
  if (headerId) {
    const [found] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, headerId))
      .limit(1);
    if (found) return found.id;
  }

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  if (email) {
    const [found] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);
    if (found) return found.id;
  }

  const [any] = await db.select({ id: user.id }).from(user).limit(1);
  return any?.id ?? null;
}
