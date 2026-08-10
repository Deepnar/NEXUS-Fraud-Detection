type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "UNKNOWN";

const LABELS: Record<RiskLevel, string> = {
  LOW: "Low risk",
  MEDIUM: "Medium risk",
  HIGH: "High risk",
  CRITICAL: "Critical",
  UNKNOWN: "Unknown",
};

/**
 * Risk chip — always shows a text label so risk is never communicated by
 * color alone (accessibility requirement from the product blueprint).
 */
export function RiskChip({ level }: { level: RiskLevel | string | null | undefined }) {
  const normalized = (level ?? "UNKNOWN").toUpperCase() as RiskLevel;
  return (
    <span className={`risk-chip risk-${normalized}`}>
      <span className="dot" aria-hidden="true" />
      {LABELS[normalized] ?? normalized}
    </span>
  );
}
