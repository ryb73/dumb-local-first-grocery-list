import { Application, Context, Next, Router } from "oak";
import { Database } from "@db/sqlite";

export interface ServerConfig {
  port: number;
  username: string;
  password: string;
  dbPath: string;
}

export class Server {
  private app: Application;
  private db: Database;

  constructor(private config: ServerConfig) {
    this.db = new Database(config.dbPath);
    this.app = new Application();
    this.setupRoutes();
  }

  private authMiddleware = async (ctx: Context, next: Next) => {
    const auth = ctx.request.headers.get("Authorization");
    if (!auth) {
      ctx.response.status = 401;
      ctx.response.headers.set("WWW-Authenticate", 'Basic realm="Secure Area"');
      return;
    }

    const [, credentials] = auth.split(" ");
    const [username, password] = atob(credentials).split(":");

    if (
      username !== this.config.username ||
      password !== this.config.password
    ) {
      ctx.response.status = 401;
      return;
    }

    await next();
  };

  private setupRoutes() {
    const router = new Router();

    router.post("/query", async (ctx) => {
      try {
        const body = await ctx.request.body().value;
        const { query, params = [] } = body;

        if (!query) {
          ctx.response.status = 400;
          ctx.response.body = { error: "Query is required" };
          return;
        }

        const result = this.db.prepare(query).all(params);
        ctx.response.body = { result };
      } catch {
        ctx.response.status = 500;
      }
    });

    this.app.use(this.authMiddleware);
    this.app.use(router.routes());
    this.app.use(router.allowedMethods());
  }

  start() {
    return new Promise<void>((resolve) => {
      void this.app.listen({ port: this.config.port });
      this.app.addEventListener("listen", () => {
        console.log(`Server running on http://localhost:${this.config.port}`);
        resolve();
      });
    });
  }

  shutdown() {
    this.db.close();
  }
}
