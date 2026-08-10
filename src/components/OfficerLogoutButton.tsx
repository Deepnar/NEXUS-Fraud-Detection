"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useState } from "react";

export function OfficerLogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/officer/auth/logout", { method: "POST" });
    } finally {
      router.push("/officer/login");
      router.refresh();
    }
  }

  return (
    <button className="button secondary" onClick={logout} disabled={busy} type="button">
      <LogOut size={16} aria-hidden="true" />
      Sign out
    </button>
  );
}
