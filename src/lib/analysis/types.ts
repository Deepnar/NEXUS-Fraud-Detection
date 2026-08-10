/**
 * Shared types for the NEXUS fraud-detection engine.
 * These mirror the Prisma enums so pure functions stay DB-free and testable.
 */

export type RiskLevel = "UNKNOWN" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type EvidenceSeverity = "info" | "low" | "medium" | "high" | "critical";

export interface EvidenceItem {
  type: string;
  severity: EvidenceSeverity;
  description: string;
}

export interface AnalysisSignal {
  type: string;
  description: string;
}

export interface RuleResult {
  ruleId: string;
  points: number;
  matched: boolean;
  description: string;
}

export interface ExtractedUrlLike {
  rawUrl: string;
  normalizedUrl: string;
  normalizedHash: string;
  host: string | null;
}

/** Optional provider-backed inputs (reputation checks, WHOIS, ...). */
export interface ProviderUrlCheck {
  urlHash: string;
  provider: string;
  verdict: "malicious" | "suspicious" | "clean" | "unknown";
  score?: number;
  reason?: string;
}

export interface AnalysisInput {
  text: string;
  urls: ExtractedUrlLike[];
  /** Provider-backed URL check results, when available. */
  providerChecks?: ProviderUrlCheck[];
}

export interface DeterministicAnalysis {
  score: number;
  riskLevel: RiskLevel;
  signals: AnalysisSignal[];
  ruleResults: RuleResult[];
  evidence: EvidenceItem[];
  safeNextSteps: string[];
  modelVersion: string;
  ruleVersion: string;
}

export const MODEL_VERSION = "nexus-deterministic-rules@1.0.0";
export const RULE_VERSION = "1.0.0";
