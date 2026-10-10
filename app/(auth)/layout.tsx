import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { Leaf } from "lucide-react";
import Link from "next/link";
import { Disclaimer } from "@/components/common/Disclaimer";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-8">
        <Link href="/welcome" className="inline-flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-brand-foreground">
            <Leaf className="h-5 w-5" aria-hidden="true" />
          </span>
          NutriPlan AI
        </Link>
        {clerkEnabled && (
          <div className="flex items-center gap-3 text-sm">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className="rounded-md px-3 py-1.5 text-ink hover:bg-surface-sunken">Sign in</button>
              </SignInButton>
              <SignUpButton>
                <button className="rounded-md bg-brand px-3 py-1.5 text-brand-foreground hover:bg-brand-dark">
                  Sign up
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </div>
        )}
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-6 sm:px-8">{children}</main>
      <footer className="px-4 pb-6 sm:px-8">
        <Disclaimer className="mx-auto max-w-2xl" />
      </footer>
    </div>
  );
}
