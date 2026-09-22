import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold">VBXSystem0</h1>
      <p className="text-muted-foreground text-sm">
        Vulnerability management MVP — Wave 0
      </p>
      <div className="flex gap-4 text-sm">
        <Link className="underline" href="/login">
          Login
        </Link>
        <Link className="underline" href="/app">
          Dashboard
        </Link>
      </div>
    </main>
  );
}
