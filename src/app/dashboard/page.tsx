import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";
import { DashboardContent, DashboardConversation } from "@/components/DashboardContent";
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

  const rows: DashboardConversation[] = conversations.map((conversation) => {
    const latestAnalysis = conversation.analysisResults[0];
    return {
      id: conversation.id,
      title: conversation.title,
      source: conversation.source,
      status: conversation.status,
      updatedAt: conversation.updatedAt.toISOString(),
      latestMessage: conversation.messages[0]?.content ?? null,
      urlCount: conversation.extractedUrls.length,
      riskLevel: latestAnalysis?.riskLevel ?? null,
      score: latestAnalysis?.score ?? null,
      analysisStatus: latestAnalysis?.status ?? null,
      reported: conversation.incidentReports.length > 0,
    };
  });

  const highRisk = rows.filter(
    (row) => row.riskLevel === "HIGH" || row.riskLevel === "CRITICAL"
  ).length;
  const reported = rows.filter((row) => row.reported).length;
  const awaiting = rows.filter((row) => row.analysisStatus === "PENDING").length;

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
          <strong>{rows.length}</strong>
          <span className="muted">Total conversations</span>
        </div>
        <div className="panel stat">
          <strong>{highRisk}</strong>
          <span className="muted">High / critical risk</span>
        </div>
        <div className="panel stat">
          <strong>{reported}</strong>
          <span className="muted">Reported incidents</span>
        </div>
        <div className="panel stat">
          <strong>{awaiting}</strong>
          <span className="muted">Analyses awaiting completion</span>
        </div>
      </section>

      <DashboardContent conversations={rows} />
    </main>
  );
}
