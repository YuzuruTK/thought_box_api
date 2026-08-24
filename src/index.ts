import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { cors } from "hono/cors";
import auth from "./routes/auth";
import thoughts from "./routes/thoughts";
import tags from "./routes/tags";
import boxes from "./routes/boxes";
import documents from "./routes/documents";
import type { Env } from "./env";

const app = new Hono<{ Bindings: Env }>();

app.use("*", logger());
app.use("*", secureHeaders());
app.use("*", cors());

// Health check
app.get("/", (c) => c.json({ status: "running", service: "thought-box-api" }));

// Routes (mounted under /api — static assets + SPA fallback own all other paths)
app.route("/api/auth", auth);
app.route("/api/thoughts", thoughts);
app.route("/api/tags", tags);
app.route("/api/boxes", boxes);
app.route("/api/documents", documents);

// 404 fallback
app.notFound((c) => c.json({ error: "Not found." }, 404));

// Global error handler — maps domain errors and unexpected failures.
app.onError((error, c) => {
  console.error("Unhandled error:", error);
  return c.json({ error: "Internal server error." }, 500);
});

export default app;