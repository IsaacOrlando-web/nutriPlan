"use client";

import { MailCheck } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AuthModal() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = (nextMode: "login" | "signup") => {
    setMode(nextMode);
    setMessage(null);
    setError(null);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === "signup") {
        const response = await api.auth.signup({ name, email, password });
        if (response.authenticated) {
          window.location.assign("/");
          return;
        }
        setMessage(response.message);
        setPassword("");
      } else {
        await api.auth.login(email, password);
        window.location.assign("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-3 text-sm">
        <DialogTrigger asChild>
          <button
            type="button"
            onClick={() => reset("login")}
            className="rounded-md px-3 py-1.5 text-ink hover:bg-surface-sunken"
          >
            Sign in
          </button>
        </DialogTrigger>
        <DialogTrigger asChild>
          <button
            type="button"
            onClick={() => reset("signup")}
            className="rounded-md bg-brand px-3 py-1.5 text-brand-foreground hover:bg-brand-dark"
          >
            Sign up
          </button>
        </DialogTrigger>
      </div>
      <DialogContent>
        <AuthForm
          mode={mode}
          name={name}
          email={email}
          password={password}
          busy={busy}
          error={error}
          message={message}
          onSubmit={submit}
          setName={setName}
          setEmail={setEmail}
          setPassword={setPassword}
          switchMode={() => reset(mode === "login" ? "signup" : "login")}
        />
      </DialogContent>
    </Dialog>
  );
}

function AuthForm({
  mode,
  name,
  email,
  password,
  busy,
  error,
  message,
  onSubmit,
  setName,
  setEmail,
  setPassword,
  switchMode,
}: {
  mode: "login" | "signup";
  name: string;
  email: string;
  password: string;
  busy: boolean;
  error: string | null;
  message: string | null;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  setName: (value: string) => void;
  setEmail: (value: string) => void;
  setPassword: (value: string) => void;
  switchMode: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{mode === "login" ? "Welcome back" : "Create your account"}</DialogTitle>
        <DialogDescription>
          {mode === "login" ? "Log in to see your plan." : "Create your account and build your first plan."}
        </DialogDescription>
      </DialogHeader>
      {message ? (
        <div className="space-y-5 rounded-xl border border-success/30 bg-success-soft/60 p-5 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-raised text-success shadow-sm ring-4 ring-success/10">
            <MailCheck className="h-7 w-7" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-semibold text-ink">Check your inbox</h3>
            <p className="text-sm leading-6 text-ink-muted">
              We sent a verification link to <strong className="font-semibold text-ink">{email}</strong>.
            </p>
            <p className="text-xs leading-5 text-ink-subtle">The link expires in 24 hours. Check your spam folder if you do not see it.</p>
          </div>
          <button
            type="button"
            onClick={switchMode}
            className="text-sm font-medium text-brand-dark underline-offset-4 hover:underline"
          >
            Return to sign in
          </button>
        </div>
      ) : (
      <form className="space-y-4" onSubmit={onSubmit}>
        {mode === "signup" && (
          <div className="space-y-1.5">
            <Label htmlFor="auth-name">Name</Label>
            <Input id="auth-name" value={name} onChange={(event) => setName(event.target.value)} required />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="auth-email">Email</Label>
          <Input id="auth-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="auth-password">Password</Label>
          <Input id="auth-password" type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
        </div>
        {error && <p role="alert" className="rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Please wait..." : mode === "login" ? "Sign in" : "Sign up"}
        </Button>
        <button type="button" onClick={switchMode} className="w-full text-sm text-ink-muted hover:text-ink">
          {mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </form>
      )}
    </>
  );
}
