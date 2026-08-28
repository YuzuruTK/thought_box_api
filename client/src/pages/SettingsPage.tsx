import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError, getAiSettings, removeAiApiKey, saveAiApiKey, type AiSettings } from "../services/api";
import { ErrorBanner } from "../components/Feedback";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { useTheme } from "../features/theme/ThemeContext";
import type { ThemeMode } from "../features/theme/ThemeContext";
import { useAppTranslation } from "../hooks/useAppTranslation";

const THEME_OPTIONS: { value: ThemeMode; labelKey: string }[] = [
  { value: "system", labelKey: "settings.appearance.system" },
  { value: "light", labelKey: "settings.appearance.light" },
  { value: "dark", labelKey: "settings.appearance.dark" },
];

/** Theme picker: System / Light / Dark, applied live via ThemeContext. */
function AppearanceSection() {
  const { mode, setMode } = useTheme();
  const { t } = useAppTranslation();
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold">{t("settings.appearance.title")}</h2>
      <p className="mt-1 text-sm text-foreground-muted">
        {t("settings.appearance.description")}
      </p>
      <div role="radiogroup" aria-label={t("settings.appearance.aria")} className="mt-4 inline-flex rounded-md border border-border p-1">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={mode === option.value}
            onClick={() => setMode(option.value)}
            className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === option.value
                ? "bg-primary text-primary-foreground"
                : "text-foreground-muted hover:bg-surface-subtle hover:text-foreground"
            }`}
          >
            {t(option.labelKey)}
          </button>
        ))}
      </div>
    </Card>
  );
}

function providerLabel(provider: AiSettings["provider"], t: (key: string) => string) {
  return provider === "byok" ? t("settings.ai.providerPersonal") : t("settings.ai.providerPlatform");
}


export default function SettingsPage() {
  const { t } = useAppTranslation();
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try { setSettings(await getAiSettings()); }
    catch (err) { setError(err instanceof ApiError ? err.message : t("settings.loadError")); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!key.trim()) return;
    setSaving(true); setError(null); setSuccess(null);
    try {
      const next = await saveAiApiKey(key.trim());
      setSettings(next);
      setKey("");
      setSuccess(t("settings.ai.saveSuccess"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("settings.ai.saveError"));
    } finally { setSaving(false); }
  }

  async function handleRemove() {
    if (!window.confirm(t("settings.ai.removeConfirm"))) return;
    setRemoving(true); setError(null); setSuccess(null);
    try {
      setSettings(await removeAiApiKey());
      setSuccess(t("settings.ai.removeSuccess"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("settings.ai.removeError"));
    } finally { setRemoving(false); }
  }

  const isPersonal = settings?.provider === "byok";
  const keyInvalid = settings?.keyStatus === "invalid";

  return (
    <main className="min-h-dvh bg-surface-muted text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-8 md:px-6">
        <header className="mb-8 flex items-center gap-4">
          <Link to="/app" className="rounded px-2 py-1 text-sm text-foreground-muted hover:bg-surface-subtle hover:text-foreground">{t("common.back")}</Link>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{t("settings.title")}</h1>
            <p className="text-xs text-foreground-faint">{t("settings.subtitle")}</p>
          </div>
        </header>

        {error && <div className="mb-4"><ErrorBanner message={error} /></div>}
        {success && (
          <div className="mb-4">
            <Alert variant="success" role="status">{success}</Alert>
          </div>
        )}

        {loading ? <p className="text-sm text-foreground-faint">{t("settings.loading")}</p> : (
          <div className="space-y-4">
            <AppearanceSection />

            <Card className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-foreground-faint">{t("settings.ai.currentProvider")}</p>
                  <h2 className="mt-1 text-base font-semibold">{providerLabel(settings?.provider ?? "platform", t)}</h2>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${isPersonal ? "bg-success-surface text-success" : "bg-surface-subtle text-foreground-muted"}`}>
                  {isPersonal ? t("settings.ai.personalAiBadge") : t("settings.ai.platformAiBadge")}
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-foreground-muted">
                {isPersonal
                  ? t("settings.ai.personalDescription")
                  : t("settings.ai.platformDescription")}
              </p>
              {isPersonal && settings?.key && (
                <div className="mt-4 flex items-center justify-between rounded-md bg-surface-muted px-3 py-2 text-sm">
                  <span className="font-mono text-foreground">{settings.key}</span>
                  <span className={settings.keyStatus === "valid" ? "text-success" : "text-warning"}>
                    {settings.keyStatus === "valid" ? t("settings.ai.keyVerified") : t("settings.ai.keyNeedsAttention")}
                  </span>
                </div>
              )}
              {keyInvalid && <p className="mt-3 text-xs text-warning">{t("settings.ai.keyInvalidWarning")}</p>}
            </Card>

            <Card className="p-5">
              <h2 className="text-base font-semibold">{isPersonal ? t("settings.ai.replaceKeyTitle") : t("settings.ai.addKeyTitle")}</h2>
              <p className="mt-1 text-sm text-foreground-muted">
                {isPersonal ? t("settings.ai.replaceKeyDescription") : t("settings.ai.addKeyDescription")}
              </p>

              <form onSubmit={handleSave} className="mt-4 space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-foreground-muted">{t("settings.ai.keyLabel")}</span>
                  <Input
                    type="password"
                    value={key}
                    onChange={(event) => setKey(event.target.value)}
                    placeholder="sk-or-…"
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono"
                  />
                </label>
                <Button type="submit" disabled={saving || !key.trim()}>
                  {saving ? t("settings.ai.verifying") : isPersonal ? t("settings.ai.replaceKey") : t("settings.ai.verifyAndSave")}
                </Button>
              </form>

              <p className="mt-4 text-xs leading-relaxed text-foreground-faint">
                {t("settings.ai.keySecurityNote")}
              </p>
            </Card>

            {isPersonal && (
              <Card className="p-5">
                <h2 className="text-base font-semibold">{t("settings.ai.removeTitle")}</h2>
                <p className="mt-1 text-sm text-foreground-muted">{t("settings.ai.removeDescription")}</p>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => void handleRemove()}
                  disabled={removing}
                >
                  {removing ? t("settings.ai.removing") : t("settings.ai.removeKey")}
                </Button>
              </Card>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
