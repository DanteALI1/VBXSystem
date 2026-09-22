import Link from "next/link";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold">VBXSystem0</span>
          <nav className="text-muted-foreground flex gap-4 text-sm">
            <Link href="/app">Dashboard</Link>
            <Link href="/app/vulnerabilities">Vulnerabilities</Link>
            <Link href="/app/assets">Assets</Link>
            <Link href="/app/findings">Findings</Link>
            <Link href="/app/scans">Scans</Link>
            <Link href="/app/settings/sync">Sync</Link>
            <Link href="/app/settings/allowlist">Allowlist</Link>
          </nav>
        </div>
      </header>
      <div className="p-6">{children}</div>
    </div>
  );
}
