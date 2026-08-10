"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { RiskChip } from "@/components/RiskChip";

interface QueueItem {
  id: string;
  status: string;
  origin: string;
  reason: string;
  createdAt: string;
  conversation: {
    id: string;
    title: string;
    source: string;
    externalSenderId: string | null;
    analysisResults: { id: string; riskLevel: string; score: number | null; status: string }[];
  };
  user: { id: string; name: string; phone: string | null } | null;
  assignments: { officer: { id: string; name: string } }[];
  _count: { notes: number };
}

const STATUS_OPTIONS = ["PENDING", "INVESTIGATING", "RESOLVED", "FALSE_POSITIVE", "ALL"];
const RISK_OPTIONS = ["", "LOW", "MEDIUM", "HIGH", "CRITICAL"];
const SOURCE_OPTIONS = ["", "WEB", "WHATSAPP"];
const ASSIGNEE_OPTIONS = ["", "me", "unassigned"];

export default function OfficerQueuePage() {
  const router = useRouter();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [status, setStatus] = useState("PENDING");
  const [risk, setRisk] = useState("");
  const [source, setSource] = useState("");
  const [assignee, setAssignee] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const fetchQueue = useCallback(async () => {
    const params = new URLSearchParams({
      status,
      page: "1",
      pageSize: "50",
    });
    if (risk) params.set("risk", risk);
    if (source) params.set("source", source);
    if (assignee) params.set("assignee", assignee);
    if (debouncedQuery) params.set("q", debouncedQuery);

    const response = await fetch(`/api/officer/incidents?${params.toString()}`);
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }
    return data as { incidents: QueueItem[]; total: number };
  }, [status, risk, source, assignee, debouncedQuery]);

  useEffect(() => {
    let cancelled = false;
    fetchQueue()
      .then((data) => {
        if (cancelled) return;
        setItems(data.incidents);
        setTotal(data.total);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the incident queue");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchQueue]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchQueue();
      setItems(data.incidents);
      setTotal(data.total);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Could not load the incident queue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <section className="page-head">
        <div>
          <h1>Incident queue</h1>
          <p className="muted">
            {total} case{total === 1 ? "" : "s"} match the current filters.
          </p>
        </div>
        <button className="button secondary" onClick={refresh} type="button">
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </button>
      </section>

      <div className="filter-bar">
        <label htmlFor="f-status" className="muted" style={{ fontSize: 13 }}>
          Status
        </label>
        <select id="f-status" value={status} onChange={(event) => setStatus(event.target.value)}>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>

        <label htmlFor="f-risk" className="muted" style={{ fontSize: 13 }}>
          Risk
        </label>
        <select id="f-risk" value={risk} onChange={(event) => setRisk(event.target.value)}>
          {RISK_OPTIONS.map((option) => (
            <option key={option} value={option}>{option || "Any risk"}</option>
          ))}
        </select>

        <label htmlFor="f-source" className="muted" style={{ fontSize: 13 }}>
          Source
        </label>
        <select id="f-source" value={source} onChange={(event) => setSource(event.target.value)}>
          {SOURCE_OPTIONS.map((option) => (
            <option key={option} value={option}>{option || "Any source"}</option>
          ))}
        </select>

        <label htmlFor="f-assignee" className="muted" style={{ fontSize: 13 }}>
          Assignee
        </label>
        <select id="f-assignee" value={assignee} onChange={(event) => setAssignee(event.target.value)}>
          {ASSIGNEE_OPTIONS.map((option) => (
            <option key={option} value={option}>{option || "Anyone"}</option>
          ))}
        </select>

        <span style={{ flex: 1 }} />

        <Search size={16} aria-hidden="true" style={{ color: "var(--muted)" }} />
        <input
          aria-label="Search cases"
          placeholder="Search title, reason, case ID…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={{ minWidth: 240 }}
        />
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {loading ? (
        <div className="panel panel-pad muted">Loading queue…</div>
      ) : items.length === 0 ? (
        <div className="panel panel-pad">
          <h2>No cases in this view</h2>
          <p className="muted">Try widening the filters, or wait for new escalations.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="queue">
            <thead>
              <tr>
                <th>Case</th>
                <th>Risk</th>
                <th>Score</th>
                <th>Status</th>
                <th>Origin</th>
                <th>Source</th>
                <th>Assignee</th>
                <th>Notes</th>
                <th>Reported</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const analysis = item.conversation.analysisResults[0];
                return (
                  <tr key={item.id} onClick={() => router.push(`/officer/incidents/${item.id}`)}>
                    <td className="title-cell">
                      <div>
                        <strong>{item.conversation.title || item.id}</strong>
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {item.user ? item.user.name : item.conversation.externalSenderId ?? "anonymous"}
                      </div>
                    </td>
                    <td>
                      <RiskChip level={analysis?.riskLevel ?? "UNKNOWN"} />
                    </td>
                    <td>{analysis?.score ?? "—"}</td>
                    <td>
                      <span className="chip">{item.status}</span>
                    </td>
                    <td>
                      <span className="chip">{item.origin}</span>
                    </td>
                    <td>{item.conversation.source}</td>
                    <td>{item.assignments[0]?.officer.name ?? "Unassigned"}</td>
                    <td>{item._count.notes}</td>
                    <td className="muted">{new Date(item.createdAt).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
