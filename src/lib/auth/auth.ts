import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";

const secret =
  process.env.AUTH_SECRET ??
  process.env.BETTER_AUTH_SECRET ??
  "dev-only-change-me";

const baseURL =
  process.env.APP_URL ??
  process.env.BETTER_AUTH_URL ??
  "http://localhost:3000";

/**
 * Better Auth (email/password). Self-signup disabled — users via bootstrap/admin.
 * Role lives on `user.role` (admin | analyst | viewer).
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  secret,
  baseURL,
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "viewer",
        input: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh cookie once per day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  trustedOrigins: [
    baseURL,
    ...(process.env.AUTH_TRUSTED_ORIGINS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? []),
  ],
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
export type SessionUser = Session["user"] & {
  role?: "admin" | "analyst" | "viewer";
};
