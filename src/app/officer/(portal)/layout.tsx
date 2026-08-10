import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { requireOfficer } from "@/lib/officer";
import { prisma } from "@/lib/prisma";
import { OfficerLogoutButton } from "@/components/OfficerLogoutButton";

export default async function OfficerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const officer = await requireOfficer();
  if (!officer) {
    redirect("/officer/login");
  }

  const unread = await prisma.notification.count({
    where: { officerId: officer.id, readAt: null },
  });

  return (
    <>
      <header className="officer-topbar">
        <div className="brand">
          <ShieldCheck size={18} style={{ verticalAlign: -3, marginRight: 8 }} aria-hidden="true" />
          NEXUS Officer Portal
        </div>
        <nav>
          <Link href="/officer">Case Queue</Link>
          {officer.role === "ADMIN" && <Link href="/admin">Admin</Link>}
          {unread > 0 && (
            <Link href="/officer/notifications" aria-label={`${unread} unread notifications`}>
              <span className="notif-dot">{unread}</span>
            </Link>
          )}
          <span className="who">
            {officer.name}
            <span className="role-badge">{officer.role}</span>
          </span>
          <OfficerLogoutButton />
        </nav>
      </header>
      {children}
    </>
  );
}
