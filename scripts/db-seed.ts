/**
 * Idempotent bootstrap: create first admin from BOOTSTRAP_ADMIN_* env.
 * Uses Better Auth password hashing (`better-auth/crypto`).
 * Public email/password sign-up remains disabled.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/db";
import { account, user } from "../src/db/schema";

function envFlagTrue(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

async function main() {
  if (envFlagTrue(process.env.BOOTSTRAP_ADMIN_DISABLED)) {
    console.log("[bootstrap] BOOTSTRAP_ADMIN_DISABLED=true — no-op");
    process.exit(0);
  }

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Administrator";

  if (!email || !password) {
    console.error(
      "[bootstrap] BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are required",
    );
    process.exit(1);
  }

  if (password.length < 12) {
    console.error("[bootstrap] password must be at least 12 characters");
    process.exit(1);
  }

  const existingAdmins = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.role, "admin"))
    .limit(1);

  if (existingAdmins.length > 0) {
    console.log(
      `[bootstrap] admin already exists (${existingAdmins[0].email}) — no-op`,
    );
    process.exit(0);
  }

  const existingByEmail = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (existingByEmail.length > 0) {
    const row = existingByEmail[0];
    if (row.role !== "admin") {
      console.error(
        `[bootstrap] user ${email} exists with role=${row.role}; refusing to promote (exit 2)`,
      );
      process.exit(2);
    }
    console.log(`[bootstrap] admin upserted: ${email} role=admin`);
    process.exit(0);
  }

  const userId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const hashed = await hashPassword(password);
  const now = new Date();

  await db.insert(user).values({
    id: userId,
    name,
    email,
    emailVerified: true,
    role: "admin",
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(account).values({
    id: accountId,
    accountId: userId,
    providerId: "credential",
    userId,
    password: hashed,
    createdAt: now,
    updatedAt: now,
  });

  console.log(`[bootstrap] admin upserted: ${email} role=admin`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("[bootstrap] failed", err);
    process.exit(1);
  });
