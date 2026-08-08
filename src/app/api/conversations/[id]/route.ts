import { jsonError, jsonOk } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, { params }: Params) {
  const session = await getSession();

  if (!session) {
    return jsonError("Unauthorized", 401);
  }

  const { id } = await params;
  const conversation = await prisma.conversation.findFirst({
    where: {
      id,
      userId: session.userId,
    },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      extractedUrls: true,
      analysisResults: { orderBy: { createdAt: "desc" } },
      incidentReports: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!conversation) {
    return jsonError("Conversation not found", 404);
  }

  return jsonOk({ conversation });
}
