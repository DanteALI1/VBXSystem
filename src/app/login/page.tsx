export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-sm space-y-4 rounded-md border bg-background p-6 shadow-sm">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">VBX</h1>
          <p className="text-sm text-muted-foreground">
            Vulnerability management console — login (Wave 1: Better Auth).
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Placeholder UI. Auth wiring lands in Wave 1.
        </p>
      </div>
    </main>
  );
}
