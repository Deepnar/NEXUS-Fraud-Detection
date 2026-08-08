import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ReportConversationForm } from "@/components/ReportConversationForm";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ConversationPage({ params }: Props) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const { id } = await params;
  const conversation = await prisma.conversation.findFirst({
    where: { id, userId: session.userId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      extractedUrls: true,
      analysisResults: { orderBy: { createdAt: "desc" } },
      incidentReports: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!conversation) {
    notFound();
  }

  const latestAnalysis = conversation.analysisResults[0];

  return (
    <main className="page">
      <section className="page-head">
        <div>
          <h1>{conversation.title}</h1>
          <div className="meta">
            <span className="chip">{conversation.source}</span>
            <span className={`chip ${conversation.incidentReports.length ? "reported" : ""}`}>
              {conversation.incidentReports.length ? "REPORTED" : conversation.status}
            </span>
            <span className="chip">{conversation.extractedUrls.length} URLs</span>
          </div>
        </div>
        <Link className="button secondary" href="/dashboard">
          Back
        </Link>
      </section>

      <section className="split">
        <div className="panel panel-pad">
          <h2>Conversation</h2>
          <div className="chat">
            {conversation.messages.map((message) => (
              <div className={`bubble ${message.sender === "USER" ? "user" : ""}`} key={message.id}>
                {message.content}
              </div>
            ))}
          </div>
        </div>

        <aside className="side-stack">
          <div className="panel panel-pad">
            <h2>Extracted URLs</h2>
            {conversation.extractedUrls.length ? (
              <ul className="url-list">
                {conversation.extractedUrls.map((url) => (
                  <li key={url.id}>{url.normalizedUrl}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">No URLs found in this conversation.</p>
            )}
          </div>

          <div className="panel panel-pad">
            <h2>Analysis Status</h2>
            <p className="chip">{latestAnalysis?.status ?? "PENDING"}</p>
            <p className="muted" style={{ marginTop: 12 }}>
              {latestAnalysis?.summary ??
                "The detection engine will attach risk evidence in the next phases."}
            </p>
          </div>

          <div className="panel panel-pad">
            <h2>Officer Escalation</h2>
            <ReportConversationForm
              conversationId={conversation.id}
              alreadyReported={conversation.incidentReports.length > 0}
            />
          </div>
        </aside>
      </section>
    </main>
  );
}
