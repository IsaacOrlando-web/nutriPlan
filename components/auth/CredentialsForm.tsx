"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLoginFlow } from "@/lib/hooks/useLoginFlow";

const schema = z.object({
  identifier: z.string().trim().min(2),
  password: z.string().optional(),
});
type Values = z.infer<typeof schema>;

const COPY = {
  login: {
    title: "Welcome back",
    subtitle: "Log in to see your plan.",
    submit: "Log in",
    switchPrompt: "New here?",
    switchLink: "Create an account",
    switchHref: "/signup",
  },
  signup: {
    title: "Create your account",
    subtitle: "Two minutes of questions, then the agents build your week.",
    submit: "Sign up",
    switchPrompt: "Already have an account?",
    switchLink: "Log in",
    switchHref: "/login",
  },
} as const;

export interface CredentialsFormProps {
  mode: "login" | "signup";
  redirectTo: string;
}

export function CredentialsForm({ mode, redirectTo }: CredentialsFormProps) {
  const copy = COPY[mode];
  const { login, pending, error } = useLoginFlow(redirectTo);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: "", password: "" },
  });

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">{copy.title}</CardTitle>
        <CardDescription>{copy.subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={form.handleSubmit((v) => void login(v.identifier))} noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="identifier">Email</Label>
            <Input
              id="identifier"
              data-testid="login-identifier"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              {...form.register("identifier")}
            />
            {form.formState.errors.identifier && (
              <p className="text-xs text-danger">Enter your email or demo name.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              {...form.register("password")}
            />
            <p className="text-xs text-ink-subtle">
              Demo users: alex@demo.nutriplan.app or maria@demo.nutriplan.app, password demo1234.
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button
            type="submit"
            data-testid="login-submit"
            className="w-full"
            size="lg"
            disabled={pending !== null}
          >
            {pending !== null && <Loader2 className="animate-spin" aria-hidden="true" />}
            {copy.submit}
          </Button>
          <p className="text-center text-sm text-ink-muted">
            {copy.switchPrompt}{" "}
            <Link
              href={copy.switchHref}
              className="font-medium text-brand underline-offset-4 hover:underline"
            >
              {copy.switchLink}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
