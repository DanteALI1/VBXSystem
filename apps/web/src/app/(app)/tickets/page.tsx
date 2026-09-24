import { Suspense } from "react";
import TicketsPage from "./TicketsClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="text-sm text-muted">Загрузка заявок…</div>}>
      <TicketsPage />
    </Suspense>
  );
}
