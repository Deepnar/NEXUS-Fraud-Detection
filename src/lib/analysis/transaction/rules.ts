import type {
  DeterministicAnalysis,
  EvidenceItem,
  EvidenceSeverity,
  RiskLevel,
} from "../types";
import { MODEL_VERSION } from "../types";
import { scoreToRiskLevel } from "../rules";

export interface TransactionAnalysisInput {
  amount: number;
  currency: string;
  txnType: string;
  receiverRef?: string | null;
  receiverName?: string | null;
  merchant?: string | null;
  description?: string | null;
  occurredAt?: Date | null;
}

interface TxnRule {
  id: string;
  severity: EvidenceSeverity;
  points: number;
  matches: (input: TransactionAnalysisInput) => boolean;
  describe: (input: TransactionAnalysisInput) => string;
}

const SECRET_REQUEST_RE = /(otp|one[\s-]?time password|password|pin|cvv|card number|login|credentials)/i;
const URGENCY_RE = /(urgent|immediately|blocked|expire|act now|last warning|today only|suspended)/i;
const SECRECY_RE = /(secret|do not tell|don't tell|confidential|keep this|don't inform)/i;

function hourOf(input: TransactionAnalysisInput): number {
  const d = input.occurredAt ?? new Date();
  return d.getHours();
}

const TXN_RULES: TxnRule[] = [
  {
    id: "txn_secret_request",
    severity: "critical",
    points: 30,
    matches: (i) => !!i.description && SECRET_REQUEST_RE.test(i.description),
    describe: () => "The transaction note asks for an OTP, password, PIN, or card details.",
  },
  {
    id: "txn_very_large_amount",
    severity: "high",
    points: 25,
    matches: (i) => i.amount >= 100000,
    describe: (i) => `Very large amount (₹${Math.round(i.amount).toLocaleString("en-IN")}) — high-impact if fraudulent.`,
  },
  {
    id: "txn_large_amount",
    severity: "medium",
    points: 15,
    matches: (i) => i.amount >= 20000 && i.amount < 100000,
    describe: (i) => `Large amount (₹${Math.round(i.amount).toLocaleString("en-IN")}) — verify the payee before proceeding.`,
  },
  {
    id: "txn_moderate_amount",
    severity: "low",
    points: 5,
    matches: (i) => i.amount >= 5000 && i.amount < 20000,
    describe: () => "Moderate amount — worth a second look at the payee.",
  },
  {
    id: "txn_round_amount",
    severity: "low",
    points: 5,
    matches: (i) => i.amount >= 5000 && i.amount % 5000 === 0,
    describe: () => "Exact round-figure amount, a common pattern in mule transfers.",
  },
  {
    id: "txn_night_time",
    severity: "low",
    points: 10,
    matches: (i) => {
      const h = hourOf(i);
      return h >= 0 && h < 5;
    },
    describe: () => "Transaction timed between midnight and 5am, when fraud rates are higher.",
  },
  {
    id: "txn_urgency_language",
    severity: "medium",
    points: 15,
    matches: (i) => !!i.description && URGENCY_RE.test(i.description),
    describe: () => "The note uses urgency or threat language to pressure quick payment.",
  },
  {
    id: "txn_secrecy_pressure",
    severity: "medium",
    points: 10,
    matches: (i) => !!i.description && SECRECY_RE.test(i.description),
    describe: () => "The note pressures secrecy — a classic manipulation tactic.",
  },
  {
    id: "txn_unknown_payee",
    severity: "low",
    points: 5,
    matches: (i) => !i.receiverRef && !i.receiverName && !i.merchant,
    describe: () => "No payee identified — unknown recipients deserve verification.",
  },
  {
    id: "txn_routine_small_amount",
    severity: "info",
    points: -10,
    matches: (i) =>
      i.amount < 1000 &&
      !(i.description && (SECRET_REQUEST_RE.test(i.description) || URGENCY_RE.test(i.description))),
    describe: () => "Small routine-sized amount with no pressure signals.",
  },
];

export const TXN_RULE_VERSION = "txn-rules-1.0.0";

const TXN_NEXT_STEPS: Record<string, string[]> = {
  txn_secret_request: [
    "Never share OTPs, PINs, or passwords to approve any payment — no legitimate payee asks for them.",
    "Cancel the transaction and report it to your bank and the fraud helpline (1930 in India).",
  ],
  txn_very_large_amount: [
    "Pause a large transfer and verify the payee through a known, independent channel first.",
    "Confirm account details character-by-character before sending.",
  ],
  txn_night_time: [
    "If you did not initiate this, contact your bank immediately to freeze the transaction.",
  ],
};

const TXN_DEFAULT_STEPS = [
  "Verify the payee independently before sending money — call a known number, not one from the message.",
  "Keep screenshots and references; they are evidence if you need to report.",
];

function buildTxnNextSteps(evidence: EvidenceItem[]): string[] {
  const steps = new Set<string>();
  for (const item of evidence) {
    for (const step of TXN_NEXT_STEPS[item.type] ?? []) steps.add(step);
  }
  for (const step of TXN_DEFAULT_STEPS) steps.add(step);
  return Array.from(steps).slice(0, 6);
}

/** Deterministic transaction analysis. Always runs; ML is advisory only. */
export function analyzeTransaction(input: TransactionAnalysisInput): DeterministicAnalysis {
  const evidence: EvidenceItem[] = [];
  const ruleResults = [];
  let score = 0;
  for (const rule of TXN_RULES) {
    if (rule.matches(input)) {
      score += rule.points;
      ruleResults.push({
        ruleId: rule.id,
        points: rule.points,
        matched: true,
        description: rule.describe(input),
      });
      evidence.push({
        type: rule.id,
        severity: rule.severity,
        description: rule.describe(input),
      });
    }
  }
  const clamped = Math.max(0, Math.min(100, score));
  const order: Record<EvidenceSeverity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
  evidence.sort((a, b) => order[b.severity] - order[a.severity]);
  const riskLevel: RiskLevel = score === 0 && evidence.length === 0 ? "LOW" : scoreToRiskLevel(clamped);
  return {
    score: clamped,
    riskLevel,
    signals: [],
    ruleResults,
    evidence,
    safeNextSteps: buildTxnNextSteps(evidence),
    modelVersion: MODEL_VERSION,
    ruleVersion: TXN_RULE_VERSION,
  };
}
