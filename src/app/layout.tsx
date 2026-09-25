import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEXUS Fraud Detection",
  description: "Explainable phishing and digital fraud conversation reporting platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link className="brand" href="/dashboard">
            NEXUS
          </Link>
          <nav>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/conversations/new">Check Message</Link>
            <Link href="/transactions/new">Check Transaction</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
