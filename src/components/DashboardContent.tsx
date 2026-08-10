"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { RiskChip } from "@/components/RiskChip";

export interface DashboardConversation {
  id: string;
  title: string;
  source: string;
  status: string;
  updatedAt: string;
  latestMessage: string | null;
  urlCount: number;
  riskLevel: string | null;
  score: number | null;
  analysisStatus: string | null;
  reported: boolean;
}

export function DashboardContent({
  conversations,
}: {
  conversations: DashboardConversation[];
}) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [risk, setRisk] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (q) {
        const haystack = [
          conversation.title,
          conversation.latestMessage ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) {
          return false;
        }
      }
      if (source && conversation.source !== source) {
        return false;
      }
      if (risk && (conversation.riskLevel ?? "UNKNOWN") !== risk) {
        return false;
      }
      return true;
    });
  }, [conversations, query, source, risk]);

  return (
    <>
      <div className="filter-bar">
        <Search size={16} aria-hidden="true" style={{ color: "var(--muted)" }} />
        <input
          aria-label="Search conversations"
          placeholder="Search by message, URL, or title…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={{ minWidth: 260 }}
        />
        <label htmlFor="d-source" className="muted" style={{ fontSize: 13 }}>
          Source
        </label>
        <select id="d-source" value={source} onChange={(event) => setSource(event.target.value)}>
          <option value="">All sources</option>
          <option value="WEB">Web</option>
          <option value="WHATSAPP">WhatsApp</option>
        </select>
        <label htmlFor="d-risk" className="muted" style={{ fontSize: 13 }}>
          Risk
        </label>
        <select id="d-risk" value={risk} onChange={(event) => setRisk(event.target.value)}>
          <option value="">All risk levels</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical</option>
        </select>
      </div>

      <section className="list">
        {filtered.length === 0 ? (
          <div className="panel panel-pad">
            <h2>No conversations match</h2>
            <p className="muted">
              {conversations.length === 0
                ? "Paste a suspicious message to create the first analysis thread."
                : "Try clearing the search or filters."}
            </p>
          </div>
        ) : (
          filtered.map((conversation) => (
            <Link
              className="conversation-row"
              href={`/conversations/${conversation.id}`}
              key={conversation.id}
            >
              <div>
                <h2>{conversation.title}</h2>
                <p className="muted">{conversation.latestMessage ?? "No messages stored"}</p>
                <div className="meta" style={{ marginTop: 10 }}>
                  {conversation.source === "WHATSAPP" ? (
                    <span className="chip">WhatsApp</span>
                  ) : (
                    <span className="chip">Web</span>
                  )}
                  <RiskChip level={conversation.riskLevel ?? "UNKNOWN"} />
                  <span className="chip">{conversation.urlCount} URLs</span>
                  <span className={`chip ${conversation.reported ? "reported" : ""}`}>
                    {conversation.reported ? "REPORTED" : conversation.status}
                  </span>
                  {conversation.analysisStatus === "PENDING" && (
                    <span className="chip">Analyzing…</span>
                  )}
                </div>
              </div>
              <span className="muted">
                {new Date(conversation.updatedAt).toLocaleDateString()}
              </span>
            </Link>
          ))
        )}
      </section>
    </>
  );
}
