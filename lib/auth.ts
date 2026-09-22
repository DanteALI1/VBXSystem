import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db/client";
import * as schema from "@/db/schema";

/**
 * Better Auth — email/password with app roles on `users.role`.
 * Map users table as better-auth `user` model.
 */
export const auth = betterAuth({
  secret: process.env.AUTH_SECRET,
  baseURL: process.env.APP_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...schema,
      user: schema.users,
    },
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  user: {
    additionalFields: {
      role: {
        type: ["admin", "analyst", "viewer"],
        required: false,
        defaultValue: "viewer",
        input: false,
      },
    },
  },
  plugins: [nextCookies()],
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
