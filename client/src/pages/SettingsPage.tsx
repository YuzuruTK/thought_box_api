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

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** Theme picker: System / Light / Dark, applied live via ThemeContext. */
function AppearanceSection() {
  const { mode, setMode } = useTheme();
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold">Appearance</h2>
      <p className="mt-1 text-sm text-foreground-muted">
        Choose how Thought Box looks. System follows your operating system setting.
      </p>
      <div role="radiogroup" aria-label="Theme" className="mt-4 inline-flex rounded-md border border-border p-1">
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
            {option.label}
          </button>
        ))}
      </div>
    </Card>
  );
}

function providerLabel(provider: AiSettings["provider"]) {
  return provider === "byok" ? "Personal OpenRouter" : "Thought Box platform";
}


export default function SettingsPage() {
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
    catch (err) { setError(err instanceof ApiError ? err.message : "Could not load AI settings."); }
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
      setSuccess("Your OpenRouter key was verified and saved securely.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the OpenRouter key.");
    } finally { setSaving(false); }
  }

  async function handleRemove() {
    if (!window.confirm("Remove your personal OpenRouter key? Thought Box will use the platform provider again.")) return;
    setRemoving(true); setError(null); setSuccess(null);
    try {
      setSettings(await removeAiApiKey());
      setSuccess("Your personal key was removed. Thought Box is using the platform provider.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove the OpenRouter key.");
    } finally { setRemoving(false); }
  }

  const isPersonal = settings?.provider === "byok";
  const keyInvalid = settings?.keyStatus === "invalid";

  return (
    <main className="min-h-dvh bg-surface-muted text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-8 md:px-6">
        <header className="mb-8 flex items-center gap-4">
          <Link to="/app" className="rounded px-2 py-1 text-sm text-foreground-muted hover:bg-surface-subtle hover:text-foreground">← Back</Link>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
            <p className="text-xs text-foreground-faint">AI provider and personal API key</p>
          </div>
        </header>

        {error && <div className="mb-4"><ErrorBanner message={error} /></div>}
        {success && (
          <div className="mb-4">
            <Alert variant="success" role="status">{success}</Alert>
          </div>
        )}

        {loading ? <p className="text-sm text-foreground-faint">Loading settings…</p> : (
          <div className="space-y-4">
            <AppearanceSection />

            <Card className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-foreground-faint">Current provider</p>
                  <h2 className="mt-1 text-base font-semibold">{providerLabel(settings?.provider ?? "platform")}</h2>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${isPersonal ? "bg-success-surface text-success" : "bg-surface-subtle text-foreground-muted"}`}>
                  {isPersonal ? "Personal AI" : "Platform AI"}
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-foreground-muted">
                {isPersonal
                  ? "Your requests use your OpenRouter account and its models, credits, and limits. Thought Box stores only an encrypted copy of your key and a masked hint."
                  : "Thought Box provides the AI connection for you. You do not need to create an OpenRouter key to use the platform provider."}
              </p>
              {isPersonal && settings?.key && (
                <div className="mt-4 flex items-center justify-between rounded-md bg-surface-muted px-3 py-2 text-sm">
                  <span className="font-mono text-foreground">{settings.key}</span>
                  <span className={settings.keyStatus === "valid" ? "text-success" : "text-warning"}>
                    {settings.keyStatus === "valid" ? "Verified" : "Needs attention"}
                  </span>
                </div>
              )}
              {keyInvalid && <p className="mt-3 text-xs text-warning">This key was rejected by OpenRouter. Add a new key to restore personal AI.</p>}
            </Card>

            <Card className="p-5">
              <h2 className="text-base font-semibold">{isPersonal ? "Replace your key" : "Use your own OpenRouter key"}</h2>
              <p className="mt-1 text-sm text-foreground-muted">
                {isPersonal ? "Enter a new key to replace the current one." : "Bring your own key if you want AI requests billed and rate-limited by your OpenRouter account."}
              </p>

              <form onSubmit={handleSave} className="mt-4 space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-foreground-muted">OpenRouter API key</span>
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
                  {saving ? "Verifying…" : isPersonal ? "Replace key" : "Verify and save"}
                </Button>
              </form>

              <p className="mt-4 text-xs leading-relaxed text-foreground-faint">
                The key is sent directly to the Thought Box API over HTTPS, verified against OpenRouter, then encrypted before storage. It is never displayed in full after saving.
              </p>
            </Card>

            {isPersonal && (
              <Card className="p-5">
                <h2 className="text-base font-semibold">Remove personal AI</h2>
                <p className="mt-1 text-sm text-foreground-muted">Delete your stored OpenRouter key and switch back to the platform provider.</p>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => void handleRemove()}
                  disabled={removing}
                >
                  {removing ? "Removing…" : "Remove key"}
                </Button>
              </Card>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
