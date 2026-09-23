"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/app";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await authClient.signIn.email({
        email: email.trim(),
        password,
      });
      if (result.error) {
        setError(result.error.message || "Invalid email or password");
        return;
      }
      router.replace(nextPath.startsWith("/") ? nextPath : "/app");
      router.refresh();
    } catch {
      setError("Sign-in failed. Check credentials and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-xs text-muted-foreground">
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-8 rounded-md text-sm"
          data-testid="login-email"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-xs text-muted-foreground">
          Password
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-8 rounded-md text-sm"
          data-testid="login-password"
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="text-xs text-destructive"
          data-testid="login-error"
        >
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        className="h-8 w-full rounded-md text-sm"
        disabled={pending}
        data-testid="login-submit"
      >
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
