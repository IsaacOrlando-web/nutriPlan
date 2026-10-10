"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AgentAvatar } from "@/components/agents/AgentAvatar";
import { ALL_AGENTS } from "@/components/agents/agent-theme";
import { Button } from "@/components/ui/button";
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

export interface AuthCardProps {
  mode: "login" | "signup";
  redirectTo: string;
}

/** One focused card, same voice as the welcome page. Demo users log in with one tap. */
export function AuthCard({ mode, redirectTo }: AuthCardProps) {
  const copy = COPY[mode];
  const { login, pending, error } = useLoginFlow(redirectTo);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: "", password: "" },
  });
  const busy = pending !== null;

  return (
    <div className="w-full max-w-sm rounded-2xl bg-surface-raised p-6 shadow-sm ring-1 ring-border sm:p-7">
      <div className="mb-5 flex justify-center -space-x-1.5" aria-hidden="true">
        {ALL_AGENTS.map((a) => (
          <span key={a} className="rounded-full ring-2 ring-surface-raised">
            <AgentAvatar agent={a} size="sm" />
          </span>
        ))}
      </div>
      <h1 className="text-center text-2xl font-semibold tracking-tight">{copy.title}</h1>
      <p className="mt-1 text-center text-sm text-ink-muted">{copy.subtitle}</p>

      <form
        className="mt-6 space-y-4"
        onSubmit={form.handleSubmit((v) => void login(v.identifier))}
        noValidate
      >
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
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" data-testid="login-submit" className="w-full" size="lg" disabled={busy}>
          {pending !== null && pending !== "alex" && pending !== "maria" && (
            <Loader2 className="animate-spin" aria-hidden="true" />
          )}
          {copy.submit}
        </Button>
      </form>

      <div className="mt-5 flex items-center gap-2 text-xs text-ink-subtle">
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        or try a demo
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void login("alex")}>
          {pending === "alex" && <Loader2 className="animate-spin" aria-hidden="true" />}
          Alex, 22
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void login("maria")}>
          {pending === "maria" && <Loader2 className="animate-spin" aria-hidden="true" />}
          Maria, 45
        </Button>
      </div>

      <p className="mt-5 text-center text-sm text-ink-muted">
        {copy.switchPrompt}{" "}
        <Link href={copy.switchHref} className="font-medium text-brand underline-offset-4 hover:underline">
          {copy.switchLink}
        </Link>
      </p>
    </div>
  );
}
