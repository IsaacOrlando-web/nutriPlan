import { CredentialsForm } from "@/components/auth/CredentialsForm";

export default function LoginPage() {
  return <CredentialsForm mode="login" redirectTo="/" />;
}
