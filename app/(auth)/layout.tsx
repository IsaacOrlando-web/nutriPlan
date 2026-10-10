import { Leaf } from "lucide-react";
import Link from "next/link";
import { AuthModal } from "@/components/auth/AuthModal";
import { Disclaimer } from "@/components/common/Disclaimer";

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
        <AuthModal />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-6 sm:px-8">{children}</main>
      <footer className="px-4 pb-6 sm:px-8">
        <Disclaimer className="mx-auto max-w-2xl" />
      </footer>
    </div>
  );
}
