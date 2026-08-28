import { useState, useMemo } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "../features/auth/AuthContext";
import { ApiError } from "../services/api";
import { useAppTranslation } from "../hooks/useAppTranslation";
import { ErrorBanner } from "../components/Feedback";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";

type Mode = "login" | "register";

export default function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const { t } = useAppTranslation();

  // Client-side validation mirroring the backend rules (email format,
  // password >= 8 chars for registration). Built per-render so Zod
  // validation messages follow the active language.
  const loginSchema = useMemo(
    () =>
      z.object({
        email: z.string().trim().email(t("auth.validation.invalidEmail")),
        password: z.string().min(1, t("auth.validation.passwordRequired")),
      }),
    [t],
  );

  const registerSchema = useMemo(
    () =>
      z.object({
        email: z.string().trim().email(t("auth.validation.invalidEmail")),
        password: z.string().min(8, t("auth.validation.passwordMinLength")),
      }),
    [t],
  );

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;

    const schema = mode === "login" ? loginSchema : registerSchema;
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      const errors: typeof fieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "email" || key === "password") {
          errors[key] ??= issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setServerError(null);
    setPending(true);
    try {
      if (mode === "login") {
        await login(parsed.data.email, parsed.data.password);
      } else {
        await register(parsed.data.email, parsed.data.password);
      }
      navigate("/app", { replace: true });
    } catch (error) {
      setServerError(
        error instanceof ApiError ? error.message : t("common.genericError"),
      );
    } finally {
      setPending(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setFieldErrors({});
    setServerError(null);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("common.brand")}</h1>
          <p className="mt-1 text-sm text-foreground-muted">{t("auth.tagline")}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-border bg-surface p-6 shadow-sm"
        >
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-medium text-foreground-muted">
              {t("auth.email")}
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.emailPlaceholder")}
            />
            {fieldErrors.email && <p className="mt-1 text-xs text-danger">{fieldErrors.email}</p>}
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-medium text-foreground-muted">
              {t("auth.password")}
            </label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "register" ? t("auth.passwordRegisterPlaceholder") : ""}
            />
            {fieldErrors.password && (
              <p className="mt-1 text-xs text-danger">{fieldErrors.password}</p>
            )}
          </div>

          {serverError && <ErrorBanner message={serverError} />}

          <Button type="submit" disabled={pending} className="w-full">
            {pending
              ? t("auth.pleaseWait")
              : mode === "login"
                ? t("auth.logIn")
                : t("auth.createAccount")}
          </Button>

          <div className="text-center text-xs text-foreground-muted">
            {mode === "login" ? (
              <>
                {t("auth.newHere")}{" "}
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className="font-medium text-foreground underline underline-offset-2 hover:text-foreground"
                >
                  {t("auth.register")}
                </button>
              </>
            ) : (
              <>
                {t("auth.alreadyHaveAccount")}{" "}
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="font-medium text-foreground underline underline-offset-2 hover:text-foreground"
                >
                  {t("auth.logIn")}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
