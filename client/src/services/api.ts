import { friendlyMessage } from "../lib/errors";
import i18next from "../i18n";

// ---------------------------------------------------------------------------
// Types mirroring the API response shapes
// ---------------------------------------------------------------------------

export interface Box {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  /** Number of thoughts in the box (computed server-side). */
  thoughtCount: number;
  /** Most recent thought activity, or null when the box is empty. */
  lastActivityAt: string | null;
  /** First ~160 chars of the cached AI summary, or null if none generated. */
  summaryPreview: string | null;
}

export interface Thought {
  id: number;
  content: string;
  aiTitle: string | null;
  aiSummary: string | null;
  tags: { id: number; name: string }[];
  boxes: { id: number; name: string }[];
  createdAt: string;
  updatedAt: string;
}

/** Synthesis metadata produced by the AI (heuristic confidence, optional theme). */
export interface SynthesisMetadata {
  /** Dominant theme, or null when none could be confidently identified. */
  coreTheme: string | null;
  /** Heuristic estimate in [0, 1] — NOT a precise measurement. */
  confidence: number | null;
  /** One or more non-empty reflection questions (typically 5). */
  questions: string[];
}

export interface GeneratedDocument {
  id: number;
  boxId: number;
  type: "summary" | "document";
  title: string;
  content: string;
  model: string;
  metadata: SynthesisMetadata | null;
  createdAt: string;
  updatedAt: string;
}

export type AiProvider = "platform" | "byok";
export type ApiKeyStatus = "valid" | "invalid" | "unverified";

export interface AiSettings {
  provider: AiProvider;
  key: string | null;
  keyStatus: ApiKeyStatus | null;
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

/** API error carrying the HTTP status and a user-presentable message. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------

const TOKEN_KEY = "thoughtbox_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string | null): void {
  if (token === null) {
    localStorage.removeItem(TOKEN_KEY);
  } else {
    localStorage.setItem(TOKEN_KEY, token);
  }
}

// ---------------------------------------------------------------------------
// Request helper
// ---------------------------------------------------------------------------

interface RequestOptions extends RequestInit {
  /**
   * Set to false for auth endpoints (bad-credential 401s must not log the
   * user out / redirect — there is no session to end yet).
   */
  allowAuthRedirect?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { allowAuthRedirect = true, ...init } = options;

  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getStoredToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError(0, i18next.t("errors.network"));
  }

  if (!response.ok) {
    // Expired/invalid token outside of the login flow: drop it and go to login.
    if (response.status === 401 && allowAuthRedirect && !path.startsWith("/api/auth/")) {
      storeToken(null);
      window.location.assign("/login");
    }
    let message = friendlyMessage(response.status);
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body?.error === "string" && body.error.length > 0) {
        message = body.error;
      }
    } catch {
      // Non-JSON error body — keep the fallback message.
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface LoginResponse {
  token: string;
  tokenType: string;
  userId: number;
}

export function register(email: string, password: string): Promise<{ id: number; email: string }> {
  return request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    allowAuthRedirect: false,
  });
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    allowAuthRedirect: false,
  });
}

// ---------------------------------------------------------------------------
// AI settings / BYOK
// ---------------------------------------------------------------------------

export function getAiSettings(): Promise<AiSettings> {
  return request("/api/settings/ai");
}

export function saveAiApiKey(key: string): Promise<AiSettings> {
  return request("/api/settings/ai/key", {
    method: "POST",
    body: JSON.stringify({ key }),
  });
}

export function removeAiApiKey(): Promise<AiSettings> {
  return request("/api/settings/ai/key", { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Boxes
// ---------------------------------------------------------------------------

export async function listBoxes(): Promise<Box[]> {
  const data = await request<{ boxes: Box[] }>("/api/boxes");
  return data.boxes;
}

export function createBox(name: string): Promise<Box> {
  return request("/api/boxes", { method: "POST", body: JSON.stringify({ name }) });
}

export function deleteBox(id: number): Promise<void> {
  return request(`/api/boxes/${id}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Thoughts
// ---------------------------------------------------------------------------

export async function listThoughts(boxId: number): Promise<Thought[]> {
  const data = await request<{ thoughts: Thought[] }>(
    `/api/thoughts?boxId=${boxId}&limit=100&offset=0`,
  );
  return data.thoughts;
}

export function createThought(content: string, boxIds: number[]): Promise<Thought> {
  return request("/api/thoughts", {
    method: "POST",
    body: JSON.stringify({ content, boxIds }),
  });
}

export function deleteThought(id: number): Promise<void> {
  return request(`/api/thoughts/${id}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Generated documents (blended synthesis: resume + structured document)
// ---------------------------------------------------------------------------

const MAX_QUESTIONS = 10;

/** Safely parse the raw metadata JSON of a generated document. */
function parseMetadata(raw: string | null | undefined): SynthesisMetadata | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const coreTheme =
      typeof obj.coreTheme === "string" && obj.coreTheme.trim().length > 0
        ? obj.coreTheme.trim()
        : null;
    const confidence =
      typeof obj.confidence === "number" && Number.isFinite(obj.confidence)
        ? Math.min(1, Math.max(0, obj.confidence))
        : null;
    const questions = Array.isArray(obj.questions)
      ? obj.questions
          .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
          .map((q) => q.trim())
          .slice(0, MAX_QUESTIONS)
      : [];
    if (coreTheme === null && confidence === null && questions.length === 0) return null;
    return { coreTheme, confidence, questions };
  } catch {
    return null;
  }
}

/** Wire format: metadata is still a raw JSON string before parsing. */
type RawGeneratedDocument = Omit<GeneratedDocument, "metadata"> & { metadata: string | null };

export async function listDocuments(boxId: number): Promise<GeneratedDocument[]> {
  const data = await request<{ documents: RawGeneratedDocument[] }>(`/api/boxes/${boxId}/documents`);
  return data.documents.map((doc) => ({ ...doc, metadata: parseMetadata(doc.metadata) }));
}

export function generateDocument(boxId: number): Promise<{ status: string }> {
  return request(`/api/boxes/${boxId}/generate-document`, { method: "POST", body: "" });
}
