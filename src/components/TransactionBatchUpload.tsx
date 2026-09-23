"use client";

import { FileUp, Loader2 } from "lucide-react";
import { useState } from "react";
import { RiskChip } from "@/components/RiskChip";

interface BatchRow {
  index: number;
  id: string;
  riskLevel: string;
  score: number | null;
}

/**
 * Batch upload for power users: pick a CSV of transactions, it is parsed
 * in the browser (no file ever hits the server raw) and scored row by row.
 * Expected headers (case-insensitive): amount, currency, txntype/type,
 * receivername/payee, receiverref/account, merchant, description/note,
 * occurredat/date.
 */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1, 201).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    return row;
  });
}

function pick(row: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    if (row[name]) return row[name];
  }
  return "";
}

export function TransactionBatchUpload() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [failed, setFailed] = useState(0);

  async function onFile(file: File) {
    setError(null);
    setRows([]);
    setFailed(0);
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        throw new Error("No data rows found. The first line must be a header row.");
      }
      const payloadRows = parsed.map((row) => {
        const mapped: Record<string, unknown> = {
          amount: Number(pick(row, "amount")) || 0,
          currency: pick(row, "currency") || "INR",
          txnType: (pick(row, "txntype", "type") || "UPI").toUpperCase(),
        };
        const optional: Record<string, string> = {
          receiverName: pick(row, "receivername", "payee", "beneficiary"),
          receiverRef: pick(row, "receiverref", "account", "upiid", "upi id"),
          merchant: pick(row, "merchant"),
          description: pick(row, "description", "note", "narration", "remarks"),
          occurredAt: pick(row, "occurredat", "date", "timestamp"),
        };
        for (const [key, value] of Object.entries(optional)) {
          if (value) mapped[key] = value;
        }
        return mapped;
      });

      const response = await fetch("/api/transactions/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: `${Date.now()}-${file.name}`,
          rows: payloadRows,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Batch scoring failed");
      }
      setRows(data.results ?? []);
      setFailed((data.failures ?? []).length);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Batch upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel panel-pad" style={{ marginTop: 24 }}>
      <h2>Batch upload (CSV)</h2>
      <p className="muted" style={{ fontSize: 13 }}>
        For statements and power users — up to 200 rows. Headers: amount, currency,
        txntype, receivername, receiverref, merchant, description, occurredat.
      </p>
      <label className="button" style={{ cursor: "pointer", display: "inline-flex" }}>
        <FileUp size={16} aria-hidden="true" />
        {busy ? "Scoring…" : "Choose CSV file"}
        <input
          type="file"
          accept=".csv,text/csv"
          hidden
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
          }}
        />
      </label>
      {busy ? <Loader2 size={16} className="spin" aria-hidden="true" /> : null}
      {error ? <p className="error">{error}</p> : null}
      {rows.length > 0 ? (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <p className="muted" style={{ fontSize: 13 }}>
            Scored {rows.length} rows{failed > 0 ? `, ${failed} failed` : ""}. High-risk
            rows are escalated to officers automatically.
          </p>
          <table className="queue">
            <thead>
              <tr>
                <th>#</th>
                <th>Risk</th>
                <th>Score</th>
                <th>Case</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.index + 1}</td>
                  <td><RiskChip level={row.riskLevel} /></td>
                  <td className="muted">{row.score ?? "—"}</td>
                  <td>
                    <a href={`/transactions/${row.id}`}>Open</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
