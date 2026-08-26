import { friendlyMessage } from "../lib/errors";

export interface Box {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  thoughtCount: number;
  lastActivityAt: string | null;
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

export interface GeneratedDocument {
  id: number;
  boxId: number;
  type: "summary" | "document";
  title: string;
  content: string;
  model: string;
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

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = "thoughtbox_token";
export function getStoredToken(): string | null { return localStorage.getItem(TOKEN_KEY); }
export function storeToken(token: string | null): void {
  if (token === null) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
}

interface RequestOptions extends RequestInit { allowAuthRedirect?: boolean; }
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { allowAuthRedirect = true, ...init } = options;
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const token = getStoredToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try { response = await fetch(path, { ...init, headers }); }
  catch { throw new ApiError(0, "Could not reach the server. Check your connection and try again."); }

  if (!response.ok) {
    if (response.status === 401 && allowAuthRedirect && !path.startsWith("/api/auth/")) {
      storeToken(null);
      window.location.assign("/login");
    }
    let message = friendlyMessage(response.status);
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body?.error === "string" && body.error.length > 0) message = body.error;
    } catch { /* keep fallback */ }
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface LoginResponse { token: string; tokenType: string; userId: number; }
export function register(email: string, password: string): Promise<{ id: number; email: string }> {
  return request("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password }), allowAuthRedirect: false });
}
export function login(email: string, password: string): Promise<LoginResponse> {
  return request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }), allowAuthRedirect: false });
}

// ---------------------------------------------------------------------------
// AI settings / BYOK
// ---------------------------------------------------------------------------
export function getAiSettings(): Promise<AiSettings> { return request("/api/settings/ai"); }
export function saveAiApiKey(key: string): Promise<AiSettings> {
  return request("/api/settings/ai/key", { method: "POST", body: JSON.stringify({ key }) });
}
export function removeAiApiKey(): Promise<AiSettings> {
  return request("/api/settings/ai/key", { method: "DELETE" });
}

export async function listBoxes(): Promise<Box[]> {
  const data = await request<{ boxes: Box[] }>("/api/boxes"); return data.boxes;
}
export function createBox(name: string): Promise<Box> { return request("/api/boxes", { method: "POST", body: JSON.stringify({ name }) }); }
export function deleteBox(id: number): Promise<void> { return request(`/api/boxes/${id}`, { method: "DELETE" }); }

export async function listThoughts(boxId: number): Promise<Thought[]> {
  const data = await request<{ thoughts: Thought[] }>(`/api/thoughts?boxId=${boxId}&limit=100&offset=0`); return data.thoughts;
}
export function createThought(content: string, boxIds: number[]): Promise<Thought> {
  return request("/api/thoughts", { method: "POST", body: JSON.stringify({ content, boxIds }) });
}
export function deleteThought(id: number): Promise<void> { return request(`/api/thoughts/${id}`, { method: "DELETE" }); }

export async function listDocuments(boxId: number): Promise<GeneratedDocument[]> {
  const data = await request<{ documents: GeneratedDocument[] }>(`/api/boxes/${boxId}/documents`); return data.documents;
}
export function generateDocument(boxId: number): Promise<{ status: string }> {
  return request(`/api/boxes/${boxId}/generate-document`, { method: "POST", body: "" });
}
