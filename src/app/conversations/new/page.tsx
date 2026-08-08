import { redirect } from "next/navigation";
import { NewConversationForm } from "@/components/NewConversationForm";
import { getSession } from "@/lib/auth";

export default async function NewConversationPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <main className="page">
      <section className="page-head">
        <div>
          <h1>New Analysis</h1>
          <p>Save a suspicious message or URL as a conversation thread.</p>
        </div>
      </section>
      <NewConversationForm />
    </main>
  );
}
