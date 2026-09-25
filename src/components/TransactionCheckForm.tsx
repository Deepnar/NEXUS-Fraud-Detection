"use client";

import { Loader2, ReceiptText, Send, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

const TXN_TYPES = ["UPI", "NEFT", "IMPS", "CARD", "CASH", "OTHER"];

/**
 * Casual single-transaction check form. Google-form style: plain fields,
 * no jargon, works for one suspicious payment a user just saw or made.
 */
export function TransactionCheckForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(formData: FormData) {
    setError("");
    setLoading(true);

    const payload: Record<string, unknown> = {
      amount: Number(formData.get("amount") ?? 0),
      currency: String(formData.get("currency") ?? "INR") || "INR",
      txnType: String(formData.get("txnType") ?? "UPI"),
    };
    for (const key of ["receiverName", "receiverRef", "merchant", "description", "occurredAt"]) {
      const value = String(formData.get(key) ?? "").trim();
      if (value) payload[key] = value;
    }

    const response = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.error ?? "Could not check this transaction");
      return;
    }

    router.push(`/transactions/${data.transaction.id}`);
    router.refresh();
  }

  return (
    <form action={submit} className="form panel panel-pad">
      <div className="field-row" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className="field" style={{ flex: "1 1 160px" }}>
          <label htmlFor="amount">Amount *</label>
          <input id="amount" name="amount" type="number" min="1" step="any" required placeholder="e.g. 18400" />
        </div>
        <div className="field" style={{ flex: "0 1 110px" }}>
          <label htmlFor="currency">Currency</label>
          <input id="currency" name="currency" defaultValue="INR" maxLength={8} />
        </div>
        <div className="field" style={{ flex: "1 1 160px" }}>
          <label htmlFor="txnType">Payment type</label>
          <select id="txnType" name="txnType" defaultValue="UPI">
            {TXN_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="field-row" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className="field" style={{ flex: "1 1 200px" }}>
          <label htmlFor="receiverName">Paid to (name)</label>
          <input id="receiverName" name="receiverName" maxLength={120} placeholder="e.g. Unknown caller" />
        </div>
        <div className="field" style={{ flex: "1 1 200px" }}>
          <label htmlFor="receiverRef">Paid to (UPI id / account)</label>
          <input id="receiverRef" name="receiverRef" maxLength={120} placeholder="e.g. xyz@upi" />
        </div>
      </div>

      <div className="field-row" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className="field" style={{ flex: "1 1 200px" }}>
          <label htmlFor="merchant">Merchant (if any)</label>
          <input id="merchant" name="merchant" maxLength={160} placeholder="e.g. Flipkart" />
        </div>
        <div className="field" style={{ flex: "1 1 200px" }}>
          <label htmlFor="occurredAt">When did it happen?</label>
          <input id="occurredAt" name="occurredAt" type="datetime-local" />
        </div>
      </div>

      <div className="field">
        <label htmlFor="description">What happened? (your own words)</label>
        <textarea
          id="description"
          name="description"
          placeholder="e.g. Got a call saying my KYC expired, paid Rs.250 fee from a link they sent..."
        />
      </div>

      <p className="muted" style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "flex-start" }}>
        <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
        Only the details above are stored for fraud analysis. Never enter full card
        numbers, CVVs, passwords, or OTPs.
      </p>

      {error ? <p className="error">{error}</p> : null}
      <button className="button" type="submit" disabled={loading}>
        {loading ? (
          <>
            <Loader2 size={16} className="spin" aria-hidden="true" />
            Checking…
          </>
        ) : (
          <>
            <ReceiptText size={16} aria-hidden="true" />
            Check This Transaction
          </>
        )}
      </button>
      <p className="muted" style={{ fontSize: 13 }}>
        <Send size={13} style={{ verticalAlign: -2 }} aria-hidden="true" /> Have a full
        statement? Use the batch upload below instead.
      </p>
    </form>
  );
}
