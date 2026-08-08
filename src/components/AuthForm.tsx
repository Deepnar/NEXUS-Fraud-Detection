"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AuthMode = "login" | "register";

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");

  async function onSubmit(formData: FormData) {
    setError("");
    setLoading(true);

    if (mode === "register" && pendingEmail) {
      const response = await fetch("/api/auth/register/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: pendingEmail,
          otp: String(formData.get("otp") ?? ""),
        }),
      });

      const data = await response.json();
      setLoading(false);

      if (!response.ok) {
        setError(data.error ?? "Verification failed");
        return;
      }

      router.push("/dashboard");
      router.refresh();
      return;
    }

    const payload =
      mode === "register"
        ? {
            name: String(formData.get("name") ?? ""),
            email: String(formData.get("email") ?? ""),
            phone: String(formData.get("phone") ?? ""),
            password: String(formData.get("password") ?? ""),
          }
        : {
            email: String(formData.get("email") ?? ""),
            password: String(formData.get("password") ?? ""),
          };

    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.error ?? "Authentication failed");
      return;
    }

    if (mode === "register") {
      setPendingEmail(String(formData.get("email") ?? ""));
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form action={onSubmit} className="form panel panel-pad">
      {mode === "register" && pendingEmail ? (
        <>
          <p className="muted">
            Enter the 6-digit verification code sent to {pendingEmail}.
          </p>
          <div className="field">
            <label htmlFor="otp">Verification code</label>
            <input
              id="otp"
              name="otp"
              inputMode="numeric"
              pattern="[0-9]{6}"
              autoComplete="one-time-code"
              required
            />
          </div>
        </>
      ) : mode === "register" ? (
        <>
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" name="name" autoComplete="name" required />
          </div>
          <div className="field">
            <label htmlFor="phone">Phone</label>
            <input id="phone" name="phone" autoComplete="tel" />
          </div>
        </>
      ) : null}
      {mode === "login" || !pendingEmail ? (
        <>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              minLength={8}
              required
            />
          </div>
        </>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      <button className="button" type="submit" disabled={loading}>
        {loading
          ? "Please wait..."
          : mode === "register" && pendingEmail
            ? "Verify And Create Account"
            : mode === "register"
              ? "Send Verification Code"
              : "Log In"}
      </button>
    </form>
  );
}
