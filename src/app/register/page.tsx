import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getSession } from "@/lib/auth";

export default async function RegisterPage() {
  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="auth-page">
      <h1>Create account</h1>
      <p>Start storing suspicious conversations for later analysis and reporting.</p>
      <AuthForm mode="register" />
      <p className="muted" style={{ marginTop: 16 }}>
        Already registered? <Link href="/login">Log in</Link>
      </p>
    </main>
  );
}
