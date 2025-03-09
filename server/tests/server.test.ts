import { Server, ServerConfig } from "../server.js";
import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { createServer } from "net";
import fs from "fs";

// Test constants
async function findOpenPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const port = (server.address() as { port: number }).port;
      server.close(() => {
        resolve(port);
      });
    });
    server.on("error", reject);
  });
}

const TEST_DB_PATH = "./test_database.db";
const TEST_USERNAME = "testuser";
const TEST_PASSWORD = "testpass";

// Server instance used by all tests
let server: Server;
let TEST_PORT: number;

// Helper function to make authenticated requests
async function makeRequest(
  path: string,
  method: string = "GET",
  body: unknown = null
): Promise<Response> {
  const authHeader = `Basic ${Buffer.from(
    `${TEST_USERNAME}:${TEST_PASSWORD}`
  ).toString("base64")}`;
  const headers = new Headers({
    Authorization: authHeader,
    "Content-Type": "application/json",
  });

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  return await fetch(`http://localhost:${TEST_PORT}${path}`, options);
}

describe("Server API", () => {
  // Setup once before all tests
  beforeAll(async () => {
    // Find an open port
    TEST_PORT = await findOpenPort();

    // Delete test database if it exists
    try {
      fs.unlinkSync(TEST_DB_PATH);
    } catch {
      // Ignore if file doesn't exist
    }

    // Create server with test configuration
    const config: ServerConfig = {
      port: TEST_PORT,
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
      dbPath: TEST_DB_PATH,
    };

    server = new Server(config);

    await server.start();
  });

  // Teardown once after all tests
  afterAll(() => {
    server.shutdown();

    // Clean up test database
    try {
      fs.unlinkSync(TEST_DB_PATH);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe("Authentication", () => {
    it("rejects unauthorized requests", async () => {
      // Make request without auth
      const response = await fetch(`http://localhost:${TEST_PORT}/all`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: "SELECT 1" }),
      });

      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toBe(
        'Basic realm="Secure Area"'
      );
    });

    it("rejects invalid credentials", async () => {
      const invalidAuthHeader = `Basic ${Buffer.from(
        "wrong:credentials"
      ).toString("base64")}`;

      const response = await fetch(`http://localhost:${TEST_PORT}/all`, {
        method: "POST",
        headers: {
          Authorization: invalidAuthHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: "SELECT 1" }),
      });

      expect(response.status).toBe(401);
    });
  });

  describe("SQL Query API", () => {
    it("accepts valid SQL queries", async () => {
      // First create a table
      await makeRequest("/run", "POST", {
        query: "CREATE TABLE test_items (id INTEGER PRIMARY KEY, name TEXT)",
      });

      // Insert data
      await makeRequest("/run", "POST", {
        query: "INSERT INTO test_items (name) VALUES (?)",
        params: ["Test Item 1"],
      });

      // Query data
      const response = await makeRequest("/all", "POST", {
        query: "SELECT * FROM test_items",
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.result.length).toBe(1);
      expect(data.result[0].name).toBe("Test Item 1");
    });

    it("rejects invalid SQL queries", async () => {
      // Send invalid SQL to run endpoint
      const response = await makeRequest("/run", "POST", {
        query: "INVALID SQL STATEMENT",
      });

      expect(response.status).toBe(500);
    });

    it("requires query parameter", async () => {
      // Send request without query
      const response = await makeRequest("/all", "POST", {
        params: ["value"],
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Query is required");
    });

    it("handles queries with parameters", async () => {
      // Create table
      await makeRequest("/run", "POST", {
        query: "CREATE TABLE params_test (id INTEGER PRIMARY KEY, value TEXT)",
      });

      // Insert with parameters
      await makeRequest("/run", "POST", {
        query: "INSERT INTO params_test (value) VALUES (?), (?), (?)",
        params: ["Value 1", "Value 2", "Value 3"],
      });

      // Query with WHERE parameter
      const response = await makeRequest("/all", "POST", {
        query: "SELECT * FROM params_test WHERE value = ?",
        params: ["Value 2"],
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.result.length).toBe(1);
      expect(data.result[0].value).toBe("Value 2");
    });
  });
});
