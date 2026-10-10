import { CredentialsForm } from "@/components/auth/CredentialsForm";

export default function SignupPage() {
  return <CredentialsForm mode="signup" redirectTo="/onboarding" />;
}
