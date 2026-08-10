"use client";

import { Loader2, Send, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewConversationForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(formData: FormData) {
    setError("");
    setLoading(true);

    const response = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "WEB",
        message: String(formData.get("message") ?? ""),
      }),
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.error ?? "Could not save conversation");
      return;
    }

    router.push(`/conversations/${data.conversation.id}`);
    router.refresh();
  }

  return (
    <form action={submit} className="form panel panel-pad">
      <div className="field">
        <label htmlFor="message">Suspicious message, URL, or fraud text</label>
        <textarea
          id="message"
          name="message"
          required
          placeholder="Paste a suspicious SMS, email, WhatsApp message, or URL..."
        />
      </div>

      <p className="muted" style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "flex-start" }}>
        <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
        Privacy: only the minimum text needed for fraud analysis is stored. Never enter
        passwords, OTPs, or full payment credentials.
      </p>

      {error ? <p className="error">{error}</p> : null}
      <button className="button" type="submit" disabled={loading}>
        {loading ? (
          <>
            <Loader2 size={16} className="spin" aria-hidden="true" />
            Analyzing…
          </>
        ) : (
          <>
            <Send size={16} aria-hidden="true" />
            Run Analysis
          </>
        )}
      </button>
    </form>
  );
}
