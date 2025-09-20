import {
  createMigrator,
  createOperationLogMigrator,
  migrationScript,
  syncRequestSchema,
  syncResponseSchema,
} from "@grocery-list/shared";
import cors from "cors";
import express from "express";
import { z } from "zod";
import {
  getMainDatabase,
  getOperationLogDatabase,
} from "./database/connection.js";
import { sync } from "./sync.js";

const app = express();
const PORT =
  process.env[`PORT`] != null ? Number.parseInt(process.env[`PORT`], 10) : 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: `10mb` }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Error handling middleware
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    // eslint-disable-next-line unused-imports/no-unused-vars
    next: express.NextFunction
  ) => {
    console.error(`Server error:`, err);

    if (err instanceof z.ZodError) {
      res.status(400).json({
        error: `Validation error`,
        details: err.issues,
      });
      return;
    }

    res.status(500).json({
      error: `Internal server error`,
      message:
        (err as { message?: string }).message ?? `Unknown error occurred`,
    });
  }
);

/**
 * POST /sync - Main sync endpoint
 * Handles the combined sync operation with migration compatibility checking,
 * requesting remote changes, and submitting local changes.
 */
app.post(`/sync`, async (req, res, next) => {
  try {
    // Validate request body
    const validatedRequest = syncRequestSchema.parse(req.body);

    const { localOperations, expectedServerVersion, clientMigrationState } =
      validatedRequest;

    console.log(
      `Sync request: ${
        localOperations.length
      } operations, expected version: ${String(expectedServerVersion)}`
    );

    // Call the sync function
    const syncResult = await sync(
      localOperations,
      expectedServerVersion,
      clientMigrationState
    );

    // Validate response before sending
    const validatedResponse = syncResponseSchema.parse(syncResult);

    console.log(`Sync response: status=${validatedResponse.status}`);

    res.json(validatedResponse);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /health - Health check endpoint
 */
app.get(`/health`, (req, res) => {
  res.json({
    status: `ok`,
    timestamp: new Date().toISOString(),
    version: process.env[`npm_package_version`] ?? `unknown`,
  });
});

/**
 * Initialize database and start server
 */
async function startServer() {
  try {
    console.log(`Initializing database...`);

    // Run main database migrations
    console.log(`Running main database migrations...`);
    const mainDb = getMainDatabase();
    const mainMigrator = createMigrator(mainDb);
    await migrationScript(mainDb, mainMigrator);
    await mainDb.destroy();

    // Run operation log migrations
    console.log(`Running operation log migrations...`);
    const opLogDb = getOperationLogDatabase();
    const opLogMigrator = createOperationLogMigrator(opLogDb);
    await migrationScript(opLogDb, opLogMigrator);
    await opLogDb.destroy();

    console.log(`Database initialized successfully`);

    // Start the server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`Sync endpoint: http://localhost:${PORT}/sync`);
    });
  } catch (error) {
    console.error(`Failed to start server:`, error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on(`SIGINT`, () => {
  console.log(`\nReceived SIGINT, shutting down gracefully...`);
  process.exit(0);
});

process.on(`SIGTERM`, () => {
  console.log(`\nReceived SIGTERM, shutting down gracefully...`);
  process.exit(0);
});

// Start the server
// eslint-disable-next-line unicorn/prefer-top-level-await
startServer().catch((error) => {
  console.error(`Unhandled error during server startup:`, error);
  process.exit(1);
});
