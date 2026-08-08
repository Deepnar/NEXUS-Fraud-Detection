import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const user = await requireUser();

  if (!user) {
    redirect("/login");
  }

  const conversations = await prisma.conversation.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      messages: { orderBy: { createdAt: "asc" }, take: 1 },
      extractedUrls: true,
      analysisResults: { orderBy: { createdAt: "desc" }, take: 1 },
      incidentReports: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const reportedCount = conversations.filter((item) => item.incidentReports.length > 0).length;

  return (
    <main className="page">
      <section className="page-head">
        <div>
          <h1>Conversation Dashboard</h1>
          <p>Signed in as {user.email}</p>
        </div>
        <div className="button-row">
          <Link className="button" href="/conversations/new">
            <MessageSquarePlus size={16} aria-hidden="true" />
            New Analysis
          </Link>
          <LogoutButton />
        </div>
      </section>

      <section className="grid" style={{ marginBottom: 24 }}>
        <div className="panel stat">
          <strong>{conversations.length}</strong>
          <span className="muted">Saved conversations</span>
        </div>
        <div className="panel stat">
          <strong>{reportedCount}</strong>
          <span className="muted">Reported incidents</span>
        </div>
        <div className="panel stat">
          <strong>
            {conversations.reduce((total, item) => total + item.extractedUrls.length, 0)}
          </strong>
          <span className="muted">Extracted URLs</span>
        </div>
      </section>

      <section className="list">
        {conversations.length === 0 ? (
          <div className="panel panel-pad">
            <h2>No conversations yet</h2>
            <p className="muted">Paste a suspicious message to create the first analysis thread.</p>
          </div>
        ) : (
          conversations.map((conversation) => (
            <Link className="conversation-row" href={`/conversations/${conversation.id}`} key={conversation.id}>
              <div>
                <h2>{conversation.title}</h2>
                <p className="muted">{conversation.messages[0]?.content ?? "No messages stored"}</p>
                <div className="meta" style={{ marginTop: 10 }}>
                  <span className="chip">{conversation.source}</span>
                  <span className="chip">{conversation.extractedUrls.length} URLs</span>
                  <span className={`chip ${conversation.incidentReports.length ? "reported" : ""}`}>
                    {conversation.incidentReports.length ? "REPORTED" : conversation.status}
                  </span>
                </div>
              </div>
              <span className="muted">{conversation.updatedAt.toLocaleDateString()}</span>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}
