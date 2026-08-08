import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getSession } from "@/lib/auth";

export default async function LoginPage() {
  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="auth-page">
      <h1>Log in</h1>
      <p>Review saved phishing conversations and report suspicious threads.</p>
      <AuthForm mode="login" />
      <p className="muted" style={{ marginTop: 16 }}>
        Need an account? <Link href="/register">Create one</Link>
      </p>
    </main>
  );
}
