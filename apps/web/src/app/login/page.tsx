import { Suspense } from "react";
import LoginPage from "./LoginClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-muted">Загрузка…</div>}>
      <LoginPage />
    </Suspense>
  );
}
