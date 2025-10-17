import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import type {
  ListExistsResponse,
  LongPollingResponse,
  SyncResponse,
} from "@grocery-list/shared";
import {
  createMigrator,
  createOperationLogMigrator,
  listExistsResponseSchema,
  migrationScript,
  syncRequestSchema,
  syncResponseSchema,
} from "@grocery-list/shared";
import cors from "cors";
import type { Response as ExpressResponse } from "express";
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

// Event emitter for notifying clients about database changes
// eslint-disable-next-line unicorn/prefer-event-target
const changeNotifier = new EventEmitter();

// Long-polling timeout in milliseconds (45 seconds)
const LONG_POLL_TIMEOUT = 45_000;

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
 * GET /list/:listId/exists - Check if a list exists on the server
 * Returns whether the specified list's databases exist on the server.
 */
app.get(
  `/list/:listId/exists`,
  (req, res: ExpressResponse<ListExistsResponse>, next) => {
    try {
      const { listId } = req.params;
      const dataDir = process.env[`DATA_DIR`] ?? `./data`;

      const mainDbPath = path.join(dataDir, `${listId}.sqlite3`);
      const logDbPath = path.join(dataDir, `${listId}.log.sqlite3`);

      // Check if both database files exist
      const exists = fs.existsSync(mainDbPath) && fs.existsSync(logDbPath);

      console.log(
        `List existence check: listId=${listId}, exists=${String(exists)}`
      );

      // Validate response before sending
      const validatedResponse = listExistsResponseSchema.parse({ exists });

      res.json(validatedResponse);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /list/:listId/sync - Main sync endpoint
 * Handles the combined sync operation with migration compatibility checking,
 * requesting remote changes, and submitting local changes.
 */
app.post(
  `/list/:listId/sync`,
  async (req, res: ExpressResponse<SyncResponse>, next) => {
    try {
      const { listId } = req.params;

      // Validate request body
      const validatedRequest = syncRequestSchema.parse(req.body);

      const { localOperations, expectedServerVersion, clientMigrationState } =
        validatedRequest;

      console.log(
        `Sync request for list ${listId}: ${
          localOperations.length
        } operations, expected version: ${String(expectedServerVersion)}`
      );

      // Call the sync function
      const syncResult = await sync(
        listId,
        localOperations,
        expectedServerVersion,
        clientMigrationState
      );

      // Validate response before sending
      const validatedResponse = syncResponseSchema.parse(syncResult);

      console.log(`Sync response: status=${validatedResponse.status}`);

      // If operations were successfully applied, notify all long-polling clients
      if (validatedResponse.status === `accepted` && localOperations.length > 0) {
        console.log(`Notifying clients of database changes`);
        changeNotifier.emit(`changes`);
      }

      res.json(validatedResponse);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /changes/poll - Long-polling endpoint for change notifications
 * Clients can connect to this endpoint and will be notified when changes occur on the server.
 * The connection will be held open until either:
 * 1. Changes are detected (returns immediately with { hasChanges: true })
 * 2. Timeout is reached (returns with { hasChanges: false })
 */
app.get(
  `/changes/poll`,
  (req, res: ExpressResponse<LongPollingResponse>, next) => {
    try {
      console.log(`Long-poll connection established`);

      // Set headers for long-polling
      res.setHeader(`Cache-Control`, `no-cache`);
      res.setHeader(`Content-Type`, `application/json`);

      // Set up timeout
      const timeout = setTimeout(() => {
        console.log(`Long-poll timeout reached`);
        res.json({ hasChanges: false });
      }, LONG_POLL_TIMEOUT);

      // Listen for changes
      const onChanges = () => {
        clearTimeout(timeout);
        console.log(`Long-poll responding with changes`);
        res.json({ hasChanges: true });
      };

      changeNotifier.once(`changes`, onChanges);

      // Clean up on client disconnect
      req.on(`close`, () => {
        console.log(`Long-poll client disconnected`);
        clearTimeout(timeout);
        changeNotifier.removeListener(`changes`, onChanges);
      });
    } catch (error) {
      next(error);
    }
  }
);

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

    // TEMPORARY: Use a hardcoded list ID until Phase 2 routing is implemented
    const TEMP_LIST_ID = `default-list`;

    // Run main database migrations
    console.log(`Running main database migrations...`);
    const mainDb = getMainDatabase(TEMP_LIST_ID);
    const mainMigrator = createMigrator(mainDb);
    await migrationScript(mainDb, mainMigrator);
    await mainDb.destroy();

    // Run operation log migrations
    console.log(`Running operation log migrations...`);
    const opLogDb = getOperationLogDatabase(TEMP_LIST_ID);
    const opLogMigrator = createOperationLogMigrator(opLogDb);
    await migrationScript(opLogDb, opLogMigrator);
    await opLogDb.destroy();

    console.log(`Database initialized successfully`);

    // Start the server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(
        `List existence: http://localhost:${PORT}/list/:listId/exists`
      );
      console.log(`Sync endpoint: http://localhost:${PORT}/list/:listId/sync`);
      console.log(
        `Long-polling endpoint: http://localhost:${PORT}/changes/poll`
      );
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
