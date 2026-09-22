import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { users } from "@/db/schema";

export type BootstrapResult =
  | { status: "created"; email: string }
  | { status: "exists"; email: string }
  | { status: "skipped"; reason: string };

/**
 * Idempotent bootstrap of the first admin from env.
 * Uses Better Auth password hashing + internal adapter (sign-up is disabled).
 */
export async function bootstrapAdmin(): Promise<BootstrapResult> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!email || !password) {
    return {
      status: "skipped",
      reason: "BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD not set",
    };
  }

  if (password.length < 8) {
    return {
      status: "skipped",
      reason: "BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters",
    };
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (existing) {
    return { status: "exists", email };
  }

  const ctx = await auth.$context;
  const hashed = await hashPassword(password);

  const user = await ctx.internalAdapter.createUser(
    {
      email,
      name: "Admin",
      emailVerified: true,
      role: "admin",
    },
    { method: "email-password" },
  );

  if (!user) {
    throw new Error("Failed to create bootstrap admin user");
  }

  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: hashed,
  });

  // Ensure role is admin even if adapter dropped the additional field.
  if (user.role !== "admin") {
    await db
      .update(users)
      .set({ role: "admin" })
      .where(eq(users.id, user.id));
  }

  return { status: "created", email };
}
