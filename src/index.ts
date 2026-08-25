import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { cors } from "hono/cors";
import auth from "./routes/auth";
import thoughts from "./routes/thoughts";
import tags from "./routes/tags";
import boxes from "./routes/boxes";
import documents from "./routes/documents";
import settings from "./routes/settings";
import type { Env } from "./env";
import { RethinkService } from "./services/rethinkService";

const app = new Hono<{ Bindings: Env }>();

app.use("*", logger());
app.use("*", secureHeaders());
app.use("*", cors());

app.get("/", (c) => c.json({ status: "running", service: "thought-box-api" }));

app.route("/api/auth", auth);
app.route("/api/thoughts", thoughts);
app.route("/api/tags", tags);
app.route("/api/boxes", boxes);
app.route("/api/documents", documents);
app.route("/api/settings", settings);

app.notFound((c) => c.json({ error: "Not found." }, 404));

app.onError((error, c) => {
  console.error("Unhandled error:", error);
  return c.json({ error: "Internal server error." }, 500);
});

async function scheduled(_controller: ScheduledController, env: Env): Promise<void> {
  const result = await new RethinkService(env).run();
  console.log(`[rethink] hour cron: processed=${result.processed} failed=${result.failed}`);
}

export default {
  fetch: app.fetch,
  scheduled,
};
