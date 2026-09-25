"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RiskChip } from "@/components/RiskChip";

interface AnalysisSummary {
  id: string;
  status: string;
  riskLevel: string;
  score: number | null;
  confidence: number | null;
  summary: string | null;
  evidence: { type: string; severity: string; description: string }[] | null;
  safeNextSteps: string[] | null;
  limitations: string[] | null;
  modelVersion: string | null;
  ruleVersion: string | null;
  completedAt: string | null;
}

/**
 * Evidence-led risk summary card for a conversation. Shows the level,
 * score, confidence, evidence with severity, recommended next steps, and
 * limitations — and lets the user re-run the analysis.
 */
export function AnalysisCard({
  analysis,
  retryUrl,
}: {
  analysis: AnalysisSummary;
  /** Override for non-conversation analyses (e.g. transaction checks). */
  retryUrl?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const evidence = analysis.evidence ?? [];

  async function retry() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(retryUrl ?? `/api/analysis/${analysis.id}/retry`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Retry failed");
      }
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Retry failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel panel-pad">
      <h2>Risk Summary</h2>

      {analysis.status === "PENDING" ? (
        <p className="muted">
          Analysis in progress — results will appear here once the engine completes.
        </p>
      ) : analysis.status === "FAILED" ? (
        <p className="error">This analysis failed. You can retry it below.</p>
      ) : (
        <>
          <div className="meta" style={{ marginBottom: 12 }}>
            <RiskChip level={analysis.riskLevel} />
            {analysis.score != null && (
              <span className="chip">Score {analysis.score}/100</span>
            )}
            {analysis.confidence != null && (
              <span className="chip">Confidence {Math.round(analysis.confidence * 100)}%</span>
            )}
          </div>

          {analysis.summary && (
            <p style={{ lineHeight: 1.55, margin: "0 0 12px" }}>{analysis.summary}</p>
          )}

          {evidence.length > 0 && (
            <>
              <h3 style={{ fontSize: 14, margin: "0 0 10px" }}>Evidence</h3>
              <ul className="evidence-list" style={{ marginBottom: 14 }}>
                {evidence.map((item, index) => (
                  <li key={`${item.type}-${index}`}>
                    <span className={`sev sev-${item.severity}`}>{item.severity}</span>
                    {item.description}
                  </li>
                ))}
              </ul>
            </>
          )}

          {analysis.safeNextSteps && analysis.safeNextSteps.length > 0 && (
            <>
              <h3 style={{ fontSize: 14, margin: "0 0 10px" }}>What to do next</h3>
              <ol className="step-list" style={{ marginBottom: 14 }}>
                {analysis.safeNextSteps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </>
          )}

          {analysis.limitations && analysis.limitations.length > 0 && (
            <>
              <h3 style={{ fontSize: 14, margin: "0 0 10px" }}>Limitations</h3>
              <ul className="step-list" style={{ marginBottom: 14 }}>
                {analysis.limitations.map((limitation, index) => (
                  <li key={index}>{limitation}</li>
                ))}
              </ul>
            </>
          )}

          <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
            {analysis.modelVersion ?? "deterministic rules"} · rules{" "}
            {analysis.ruleVersion ?? "—"}
            {analysis.completedAt
              ? ` · analyzed ${new Date(analysis.completedAt).toLocaleString()}`
              : ""}
          </p>
        </>
      )}

      {error && <p className="error">{error}</p>}
      <button className="button secondary" onClick={retry} disabled={busy} type="button">
        <RefreshCw size={15} aria-hidden="true" />
        {busy ? "Re-analyzing…" : "Re-analyze"}
      </button>
    </div>
  );
}
