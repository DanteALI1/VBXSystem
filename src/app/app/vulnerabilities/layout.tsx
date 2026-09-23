export default function VulnerabilitiesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--muted)_0%,_var(--background)_55%)]">
      {children}
    </div>
  );
}
