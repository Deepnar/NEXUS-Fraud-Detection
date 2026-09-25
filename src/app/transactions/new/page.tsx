import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { TransactionCheckForm } from "@/components/TransactionCheckForm";
import { TransactionBatchUpload } from "@/components/TransactionBatchUpload";

export default async function NewTransactionPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <main className="page">
      <section className="page-head">
        <div>
          <h1>Check a transaction</h1>
          <p className="muted">
            One suspicious payment? Fill the form. A full statement? Upload the CSV.
          </p>
        </div>
      </section>

      <TransactionCheckForm />
      <TransactionBatchUpload />
    </main>
  );
}
