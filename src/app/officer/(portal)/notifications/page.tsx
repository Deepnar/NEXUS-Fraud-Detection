"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { RiskChip } from "@/components/RiskChip";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export default function OfficerNotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/officer/notifications")
      .then((response) => response.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setItems(data.notifications);
        }
      })
      .catch(() => setError("Could not load notifications"));
  }, []);

  async function markRead(id: string) {
    await fetch(`/api/officer/notifications/${id}/read`, { method: "POST" });
    setItems((previous) =>
      previous.map((item) => (item.id === id ? { ...item, readAt: new Date().toISOString() } : item))
    );
  }

  return (
    <main className="page">
      <section className="page-head">
        <div>
          <h1>
            <Bell style={{ verticalAlign: -4, marginRight: 8 }} aria-hidden="true" />
            Notifications
          </h1>
          <p className="muted">Operational alerts from the automation layer.</p>
        </div>
      </section>

      {error && <p className="error">{error}</p>}

      <section className="list">
        {items.length === 0 ? (
          <div className="panel panel-pad">
            <h2>No notifications</h2>
            <p className="muted">Workflow failures and escalations will appear here.</p>
          </div>
        ) : (
          items.map((item) => (
            <article className={`panel panel-pad ${item.readAt ? "" : "unread"}`} key={item.id}>
              <div className="meta" style={{ marginBottom: 6 }}>
                <span className="chip">{item.type}</span>
                <span className="muted">{new Date(item.createdAt).toLocaleString()}</span>
              </div>
              <h2 style={{ margin: "0 0 6px", fontSize: 16 }}>{item.title}</h2>
              <p className="muted" style={{ whiteSpace: "pre-wrap" }}>{item.body}</p>
              {!item.readAt && (
                <button className="button secondary" style={{ marginTop: 10 }} onClick={() => markRead(item.id)} type="button">
                  Mark as read
                </button>
              )}
            </article>
          ))
        )}
      </section>
    </main>
  );
}
