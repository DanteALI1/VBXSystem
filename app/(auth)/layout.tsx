import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-muted/40 flex min-h-screen items-center justify-center p-4">
      {children}
    </div>
  );
}
