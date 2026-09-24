"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type Prefs = {
  new_vulns: boolean;
  kev_updates: boolean;
  nvd_sync: boolean;
  bdu_import: boolean;
  ticket_events: boolean;
  channel_toast: boolean;
  channel_modal: boolean;
};

const LABELS: { key: keyof Prefs; label: string; hint: string }[] = [
  { key: "new_vulns", label: "Новые уязвимости", hint: "Уведомления о новых CVE" },
  { key: "kev_updates", label: "Обновления CISA KEV", hint: "Новые записи в каталоге KEV" },
  { key: "nvd_sync", label: "Синхронизация NVD", hint: "Успех/ошибка sync NVD" },
  { key: "bdu_import", label: "Импорт БДУ", hint: "Завершение загрузки БДУ" },
  { key: "ticket_events", label: "События заявок", hint: "Назначение и статусы (W7)" },
  { key: "channel_toast", label: "In-app toast", hint: "Всплывающие уведомления" },
  { key: "channel_modal", label: "In-app modal", hint: "Модальные оповещения" },
];

export default function NotificationsSettingsPage() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Prefs>("/settings/notifications")
      .then(setPrefs)
      .catch((e) => setErr(e.message));
  }, []);

  async function save() {
    if (!prefs) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api<Prefs>("/settings/notifications", {
        method: "PUT",
        body: JSON.stringify(prefs),
      });
      setPrefs(res);
      setMsg("Предпочтения сохранены");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  if (!prefs) return <div className="text-sm text-muted">Загрузка…</div>;

  return (
    <div className="space-y-4" data-testid="settings-notifications">
      <Card className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Уведомления</h2>
        <p className="text-sm text-muted">Персональные предпочтения in-app каналов.</p>
        {LABELS.map((item) => (
          <label key={item.key} className="flex items-start gap-3 rounded-xl border border-border px-3 py-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={prefs[item.key]}
              onChange={(e) => setPrefs({ ...prefs, [item.key]: e.target.checked })}
            />
            <span>
              <span className="font-medium">{item.label}</span>
              <span className="mt-0.5 block text-xs text-muted">{item.hint}</span>
            </span>
          </label>
        ))}
        <Button type="button" onClick={save} disabled={busy}>
          {busy ? "Сохранение…" : "Сохранить"}
        </Button>
        {msg && <p className="text-sm text-ok">{msg}</p>}
        {err && <p className="text-sm text-danger">{err}</p>}
      </Card>
    </div>
  );
}
