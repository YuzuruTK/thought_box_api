import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, getAiSettings, removeAiApiKey, saveAiApiKey, type AiSettings } from "../services/api";
import { ErrorBanner } from "../components/Feedback";

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

  async function handleSave(event: React.FormEvent) {
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
    <main className="min-h-dvh bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-2xl px-4 py-8 md:px-6">
        <header className="mb-8 flex items-center gap-4">
          <Link to="/app" className="rounded px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800">← Back</Link>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
            <p className="text-xs text-neutral-400">AI provider and personal API key</p>
          </div>
        </header>

        {error && <div className="mb-4"><ErrorBanner message={error} /></div>}
        {success && <div role="status" className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{success}</div>}

        {loading ? <p className="text-sm text-neutral-400">Loading settings…</p> : (
          <div className="space-y-4">
            <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">Current provider</p>
                  <h2 className="mt-1 text-base font-semibold">{providerLabel(settings?.provider ?? "platform")}</h2>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${isPersonal ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-600"}`}>
                  {isPersonal ? "Personal AI" : "Platform AI"}
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-neutral-600">
                {isPersonal
                  ? "Your requests use your OpenRouter account and its models, credits, and limits. Thought Box stores only an encrypted copy of your key and a masked hint."
                  : "Thought Box provides the AI connection for you. You do not need to create an OpenRouter key to use the platform provider."}
              </p>
              {isPersonal && settings?.key && (
                <div className="mt-4 flex items-center justify-between rounded-md bg-neutral-50 px-3 py-2 text-sm">
                  <span className="font-mono text-neutral-700">{settings.key}</span>
                  <span className={settings.keyStatus === "valid" ? "text-green-600" : "text-amber-600"}>
                    {settings.keyStatus === "valid" ? "Verified" : "Needs attention"}
                  </span>
                </div>
              )}
              {keyInvalid && <p className="mt-3 text-xs text-amber-700">This key was rejected by OpenRouter. Add a new key to restore personal AI.</p>}
            </section>

            <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold">{isPersonal ? "Replace your key" : "Use your own OpenRouter key"}</h2>
              <p className="mt-1 text-sm text-neutral-500">
                {isPersonal ? "Enter a new key to replace the current one." : "Bring your own key if you want AI requests billed and rate-limited by your OpenRouter account."}
              </p>

              <form onSubmit={handleSave} className="mt-4 space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-neutral-600">OpenRouter API key</span>
                  <input
                    type="password"
                    value={key}
                    onChange={(event) => setKey(event.target.value)}
                    placeholder="sk-or-…"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-sm outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-400"
                  />
                </label>
                <button
                  type="submit"
                  disabled={saving || !key.trim()}
                  className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Verifying…" : isPersonal ? "Replace key" : "Verify and save"}
                </button>
              </form>

              <p className="mt-4 text-xs leading-relaxed text-neutral-400">
                The key is sent directly to the Thought Box API over HTTPS, verified against OpenRouter, then encrypted before storage. It is never displayed in full after saving.
              </p>
            </section>

            {isPersonal && (
              <section className="rounded-xl border border-red-100 bg-white p-5 shadow-sm">
                <h2 className="text-base font-semibold text-neutral-900">Remove personal AI</h2>
                <p className="mt-1 text-sm text-neutral-500">Delete your stored OpenRouter key and switch back to the platform provider.</p>
                <button
                  type="button"
                  onClick={() => void handleRemove()}
                  disabled={removing}
                  className="mt-4 rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {removing ? "Removing…" : "Remove key"}
                </button>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
