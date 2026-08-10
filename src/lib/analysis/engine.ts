import { extractSignals } from "./signals";
import { RULE_SET_VERSION, runRules } from "./rules";
import {
  MODEL_VERSION,
  type AnalysisInput,
  type DeterministicAnalysis,
  type EvidenceItem,
  type RiskLevel,
} from "./types";

/**
 * The deterministic fraud-analysis engine.
 *
 * Runs Layer 1 (signals) and Layer 3 (rules) and produces a complete,
 * explainable result: numeric score, risk level, evidence list, and safe
 * next steps. Provider-backed reputation checks are optional inputs.
 */

const NEXT_STEPS_BY_EVIDENCE: Record<string, string[]> = {
  credential_or_otp_request: [
    "Never share OTPs, passwords, PINs, or card details with anyone, even if the sender claims to be a bank or support team.",
    "Contact the organization using an official channel to confirm the request.",
  ],
  payment_or_bank_request: [
    "Do not send money, pay fees, or share bank details based on this message.",
    "Verify any refund or payment claim directly with your bank's official app or helpline.",
  ],
  urgent_threat_language: [
    "Ignore the urgency. Legitimate banks and authorities do not threaten account closure via SMS or chat.",
    "Check your account through the official app or website rather than links in the message.",
  ],
  impersonation_claim: [
    "Treat the sender as unverified even if they claim to be a known company.",
    "Contact the company via its official website or app, never via a number in the message.",
  ],
  prize_or_reward: [
    "Do not pay any 'processing fee' or 'tax' to claim a prize — this is a common scam pattern.",
    "Do not share personal details to 'claim' a reward.",
  ],
  channel_switch_request: [
    "Do not move the conversation to another private channel or install apps from links.",
    "Keep conversations on the official platform where they can be reviewed.",
  ],
  suspicious_attachment: [
    "Do not open or download the file.",
    "Scan suspicious files with an antivirus before any other action.",
  ],
  secrecy_pressure: [
    "Telling you to keep it secret is a manipulation tactic. Share the message with someone you trust.",
    "Report the message to the official fraud helpline (e.g. 1930 in India).",
  ],
  excessive_punctuation: [
    "High-pressure writing style is common in scam messages. Slow down and verify.",
  ],
  excessive_capitalization: [
    "High-pressure writing style is common in scam messages. Slow down and verify.",
  ],
  shortened_or_redirect_url: [
    "Do not click shortened links. Expand them first or ignore them entirely.",
    "Type the official website address directly into your browser instead.",
  ],
  punycode_or_lookalike_domain: [
    "Do not visit the link — lookalike and IP-address domains are strong phishing signals.",
  ],
  brand_host_mismatch: [
    "The link does not belong to the brand named in the message. Do not click it.",
  ],
  known_bad_reputation: [
    "A reputation provider has flagged this link as malicious. Do not open it.",
    "Report the message to the platform and to the national fraud helpline (1930 in India).",
  ],
  suspicious_provider_verdict: [
    "A reputation provider has flagged this link as suspicious. Avoid it until verified.",
  ],
  new_or_low_reputation_domain: [
    "The link uses a new or low-reputation domain. Avoid entering any details.",
  ],
  safe_known_domain: [
    "The link checked clean against reputation providers, but stay alert for lookalike pages.",
  ],
};

const DEFAULT_NEXT_STEPS = [
  "If anything feels off, do not click links or reply with personal details.",
  "Report the message to the platform and to the national fraud helpline (1930 in India).",
  "Keep the original message — do not delete it, it is evidence.",
];

export function analyzeMessage(input: AnalysisInput): DeterministicAnalysis {
  const { score, riskLevel, ruleResults, evidence } = runRules(input);
  const signals = extractSignals(input.text);

  const safeNextSteps = buildNextSteps(evidence);

  return {
    score,
    riskLevel,
    signals,
    ruleResults,
    evidence,
    safeNextSteps,
    modelVersion: MODEL_VERSION,
    ruleVersion: RULE_SET_VERSION,
  };
}

function buildNextSteps(evidence: EvidenceItem[]): string[] {
  const steps = new Set<string>();
  for (const item of evidence) {
    const mapped = NEXT_STEPS_BY_EVIDENCE[item.type];
    if (mapped) {
      for (const step of mapped) {
        steps.add(step);
      }
    }
  }
  for (const step of DEFAULT_NEXT_STEPS) {
    steps.add(step);
  }
  return Array.from(steps).slice(0, 6);
}

export function riskLevelLabel(level: RiskLevel): string {
  switch (level) {
    case "CRITICAL":
      return "Critical risk";
    case "HIGH":
      return "High risk";
    case "MEDIUM":
      return "Medium risk";
    case "LOW":
      return "Low risk";
    default:
      return "Unable to determine";
  }
}
