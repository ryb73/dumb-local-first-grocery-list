import express from "express";
import Sqlite, { Database } from "better-sqlite3";
import basicAuth from "express-basic-auth";

export interface ServerConfig {
  port: number;
  username: string;
  password: string;
  dbPath: string;
}

export class Server {
  private app: express.Application;
  private db: Database;

  constructor(private config: ServerConfig) {
    this.db = new Sqlite(config.dbPath);
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(express.json());

    // Basic authentication middleware
    this.app.use(
      basicAuth({
        users: { [this.config.username]: this.config.password },
        challenge: true,
        realm: "Secure Area",
      })
    );
  }

  private setupRoutes() {
    // For queries that return data (SELECT statements)
    this.app.post("/all", (req: express.Request, res: express.Response) => {
      try {
        const { query, params = [] } = req.body;

        if (!query) {
          res.status(400).json({ error: "Query is required" });
          return;
        }

        const result = this.db.prepare(query).all(params);
        res.json({ result });
      } catch (error) {
        console.error(error);
        res.status(500).json({
          error: "Internal server error",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // For queries that don't return data (INSERT, UPDATE, DELETE, CREATE, etc.)
    this.app.post("/run", (req: express.Request, res: express.Response) => {
      try {
        const { query, params = [] } = req.body;

        if (!query) {
          res.status(400).json({ error: "Query is required" });
          return;
        }

        const result = this.db.prepare(query).run(params);
        res.json({ result });
      } catch (error) {
        console.error(error);
        res.status(500).json({
          error: "Internal server error",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  start() {
    return new Promise<void>((resolve) => {
      this.app.listen(this.config.port, () => {
        console.log(`Server running on http://localhost:${this.config.port}`);
        resolve();
      });
    });
  }

  shutdown() {
    this.db.close();
  }
}
