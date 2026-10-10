"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { api, isApiRequestError } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { useProfile } from "@/lib/hooks/useProfile";
import { keys } from "@/lib/hooks/keys";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const profile = useProfile();
  const session = useQuery({ queryKey: keys.session, queryFn: api.auth.session });
  const missingProfile = isApiRequestError(profile.error, 404);
  const isCompleted = Boolean(profile.data?.profile) || session.data?.hasProfile === true;
  const sessionMissingProfile =
    !profile.data && session.data?.userId !== null && !isCompleted;

  useEffect(() => {
    if ((missingProfile || sessionMissingProfile) && pathname !== "/profile") router.replace("/profile");
  }, [missingProfile, pathname, router, sessionMissingProfile]);

  if (pathname !== "/profile" && (profile.isPending || session.isPending || missingProfile || sessionMissingProfile)) return null;
  return <AppShell isFormCompleted={isCompleted}>{children}</AppShell>;
}
