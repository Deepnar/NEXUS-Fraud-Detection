import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquarePlus, ReceiptText } from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";
import { DashboardContent, DashboardConversation, DashboardTransaction } from "@/components/DashboardContent";
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

  const checks = await prisma.transactionCheck.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      incidentReports: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const txnRows: DashboardTransaction[] = checks.map((check) => ({
    id: check.id,
    amount: check.amount,
    currency: check.currency,
    txnType: check.txnType,
    payee: check.receiverName ?? check.merchant ?? check.receiverRef,
    riskLevel: check.riskLevel,
    score: check.score,
    status: check.status,
    updatedAt: check.createdAt.toISOString(),
    reported: check.incidentReports.length > 0,
  }));

  const txnHighRisk = txnRows.filter(
    (row) => row.riskLevel === "HIGH" || row.riskLevel === "CRITICAL"
  ).length;

  return (
    <main className="page">
      <section className="page-head">
        <div>
          <h1>Fraud Dashboard</h1>
          <p>Signed in as {user.email}</p>
        </div>
        <div className="button-row">
          <Link className="button" href="/conversations/new">
            <MessageSquarePlus size={16} aria-hidden="true" />
            Check Message
          </Link>
          <Link className="button" href="/transactions/new">
            <ReceiptText size={16} aria-hidden="true" />
            Check Transaction
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
          <strong>{txnRows.length}</strong>
          <span className="muted">Transactions checked</span>
        </div>
        <div className="panel stat">
          <strong>{highRisk + txnHighRisk}</strong>
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

      <DashboardContent conversations={rows} transactions={txnRows} />
    </main>
  );
}
