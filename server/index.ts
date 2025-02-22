import { Application, Router } from "oak";
import { Database } from "@db/sqlite";

const db = new Database("./data.db");
const app = new Application();
const router = new Router();

// Basic auth middleware
const authMiddleware = async (ctx: any, next: any) => {
  const auth = ctx.request.headers.get("Authorization");
  if (!auth) {
    ctx.response.status = 401;
    ctx.response.headers.set("WWW-Authenticate", 'Basic realm="Secure Area"');
    return;
  }

  const [, credentials] = auth.split(" ");
  const [username, password] = atob(credentials).split(":");

  // Replace these with your desired credentials
  if (username !== "admin" || password !== "password") {
    ctx.response.status = 401;
    return;
  }

  await next();
};

// Query endpoint
router.post("/query", async (ctx) => {
  try {
    const body = await ctx.request.body().value;
    const { query, params = [] } = body;

    if (!query) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Query is required" };
      return;
    }

    // Execute query with optional parameters
    const result = db.prepare(query).all(params);

    ctx.response.body = { result };
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: error.message };
  }
});

// Apply middleware and routes
app.use(authMiddleware);
app.use(router.routes());
app.use(router.allowedMethods());

// Start server
console.log("Server running on http://localhost:3000");
await app.listen({ port: 3000 });

// Add cleanup on server shutdown
addEventListener("unload", () => {
  db.close();
});
