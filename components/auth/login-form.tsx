"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const loginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const { error } = await signIn.email({
      email: values.email,
      password: values.password,
    });

    if (error) {
      setFormError(error.message ?? "Invalid email or password");
      return;
    }

    router.push("/app");
    router.refresh();
  });

  return (
    <Card className="w-full max-w-sm" size="sm" data-testid="login-card">
      <CardHeader>
        <CardTitle>VBXSystem0</CardTitle>
        <CardDescription>Sign in to continue</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3"
          onSubmit={onSubmit}
          noValidate
          data-testid="login-form"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              aria-invalid={Boolean(errors.email)}
              data-testid="login-email"
              {...register("email")}
            />
            {errors.email ? (
              <p className="text-destructive text-xs">{errors.email.message}</p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              data-testid="login-password"
              {...register("password")}
            />
            {errors.password ? (
              <p className="text-destructive text-xs">
                {errors.password.message}
              </p>
            ) : null}
          </div>

          {formError ? (
            <p
              className="text-destructive text-sm"
              role="alert"
              data-testid="login-error"
            >
              {formError}
            </p>
          ) : null}

          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting}
            data-testid="login-submit"
          >
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
