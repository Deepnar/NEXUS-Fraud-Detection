"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, ClipboardList, Users } from "lucide-react";

interface OverviewStats {
  officers: number;
  users: number;
  conversations: number;
  incidentsByStatus: { status: string; _count: { _all: number } }[];
  pendingHighRisk: number;
  unreadNotifications: number;
  auditEntries: number;
  failedJobs: number;
}

interface AuditRow {
  id: string;
  actorType: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  createdAt: string;
}

interface OfficerRow {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function AdminPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [officers, setOfficers] = useState<OfficerRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/overview").then((response) => response.json()),
      fetch("/api/officer/audit-log?pageSize=40").then((response) => response.json()),
      fetch("/api/officer/officers").then((response) => response.json()),
    ])
      .then(([overview, audit, directory]) => {
        if (overview.error) throw new Error(overview.error);
        setStats(overview.stats);
        setLogs(audit.logs ?? []);
        setOfficers(directory.officers ?? []);
      })
      .catch((requestError) =>
        setError(requestError instanceof Error ? requestError.message : "Could not load admin data")
      );
  }, []);

  if (error) {
    return (
      <main className="page">
        <p className="error" role="alert">{error}</p>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="page-head">
        <div>
          <h1>System overview</h1>
          <p className="muted">Operational health, officers, and the security audit trail.</p>
        </div>
      </section>

      <section className="grid" style={{ marginBottom: 24 }}>
        <div className="panel stat">
          <strong>{stats?.conversations ?? "—"}</strong>
          <span className="muted"><ClipboardList size={13} style={{ verticalAlign: -2 }} /> Conversations</span>
        </div>
        <div className="panel stat">
          <strong>{stats?.pendingHighRisk ?? "—"}</strong>
          <span className="muted"><AlertTriangle size={13} style={{ verticalAlign: -2 }} /> Open high/critical cases</span>
        </div>
        <div className="panel stat">
          <strong>{stats?.officers ?? "—"}</strong>
          <span className="muted"><Users size={13} style={{ verticalAlign: -2 }} /> Officers</span>
        </div>
        <div className="panel stat">
          <strong>{stats?.failedJobs ?? "—"}</strong>
          <span className="muted"><Activity size={13} style={{ verticalAlign: -2 }} /> Failed analysis jobs</span>
        </div>
      </section>

      <section className="split" style={{ marginBottom: 24 }}>
        <div className="card">
          <h3>Officers</h3>
          <ul className="url-list">
            {officers.map((officer) => (
              <li key={officer.id}>
                <strong>{officer.name}</strong>{" "}
                <span className="muted">{officer.email}</span>{" "}
                <span className="chip">{officer.role}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h3>Incidents by status</h3>
          <ul className="url-list">
            {(stats?.incidentsByStatus ?? []).map((row) => (
              <li key={row.status}>
                <strong>{row.status}</strong>{" "}
                <span className="muted">{row._count._all} case{row._count._all === 1 ? "" : "s"}</span>
              </li>
            ))}
            {(stats?.incidentsByStatus ?? []).length === 0 && (
              <li className="muted">No incidents recorded yet.</li>
            )}
          </ul>
        </div>
      </section>

      <section className="card">
        <h3>Recent audit log</h3>
        <div className="table-wrap">
          <table className="queue">
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="muted">{new Date(log.createdAt).toLocaleString()}</td>
                  <td><span className="chip">{log.actorType}</span></td>
                  <td><code>{log.action}</code></td>
                  <td className="muted">
                    {log.targetType ? `${log.targetType}:${log.targetId ?? ""}`.slice(0, 40) : "—"}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={4} className="muted">No audit entries yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
