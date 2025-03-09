import { Server, ServerConfig } from "../server.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { delay } from "https://deno.land/std@0.224.0/async/delay.ts";
import { describe, it, beforeAll, afterAll } from "jsr:@std/testing/bdd";

// Test constants
async function findOpenPort(): Promise<number> {
  for (let port = 3000; port < 65536; port++) {
    try {
      const listener = await Deno.listen({ port });
      listener.close();
      return port;
    } catch {
      continue;
    }
  }
  throw new Error("No available ports found");
}

const TEST_PORT = await findOpenPort();
const TEST_DB_PATH = "./test_database.db";
const TEST_USERNAME = "testuser";
const TEST_PASSWORD = "testpass";

// Server instance used by all tests
let server: Server;

// Helper function to make authenticated requests
async function makeRequest(
  path: string,
  method: string = "GET",
  body: unknown = null
): Promise<Response> {
  const authHeader = `Basic ${btoa(`${TEST_USERNAME}:${TEST_PASSWORD}`)}`;
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
    // Delete test database if it exists
    try {
      await Deno.remove(TEST_DB_PATH);
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
  afterAll(async () => {
    server.shutdown();
    await delay(100);

    // Clean up test database
    try {
      await Deno.remove(TEST_DB_PATH);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe("Authentication", () => {
    it("rejects unauthorized requests", async () => {
      // Make request without auth
      const response = await fetch(`http://localhost:${TEST_PORT}/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: "SELECT 1" }),
      });

      assertEquals(response.status, 401);
      assertEquals(
        response.headers.get("WWW-Authenticate"),
        'Basic realm="Secure Area"'
      );
    });

    it("rejects invalid credentials", async () => {
      const invalidAuthHeader = `Basic ${btoa("wrong:credentials")}`;

      const response = await fetch(`http://localhost:${TEST_PORT}/query`, {
        method: "POST",
        headers: {
          Authorization: invalidAuthHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: "SELECT 1" }),
      });

      assertEquals(response.status, 401);
    });
  });

  describe("SQL Query API", () => {
    it("accepts valid SQL queries", async () => {
      // First create a table
      await makeRequest("/query", "POST", {
        query: "CREATE TABLE test_items (id INTEGER PRIMARY KEY, name TEXT)",
      });

      // Insert data
      await makeRequest("/query", "POST", {
        query: "INSERT INTO test_items (name) VALUES (?)",
        params: ["Test Item 1"],
      });

      // Query data
      const response = await makeRequest("/query", "POST", {
        query: "SELECT * FROM test_items",
      });

      assertEquals(response.status, 200);
      const data = await response.json();
      assertEquals(data.result.length, 1);
      assertEquals(data.result[0].name, "Test Item 1");
    });

    it("rejects invalid SQL queries", async () => {
      // Send invalid SQL
      const response = await makeRequest("/query", "POST", {
        query: "INVALID SQL STATEMENT",
      });

      assertEquals(response.status, 500);
    });

    it("requires query parameter", async () => {
      // Send request without query
      const response = await makeRequest("/query", "POST", {
        params: ["value"],
      });

      assertEquals(response.status, 400);
      const data = await response.json();
      assertEquals(data.error, "Query is required");
    });

    it("handles queries with parameters", async () => {
      // Create table
      await makeRequest("/query", "POST", {
        query: "CREATE TABLE params_test (id INTEGER PRIMARY KEY, value TEXT)",
      });

      // Insert with parameters
      await makeRequest("/query", "POST", {
        query: "INSERT INTO params_test (value) VALUES (?), (?), (?)",
        params: ["Value 1", "Value 2", "Value 3"],
      });

      // Query with WHERE parameter
      const response = await makeRequest("/query", "POST", {
        query: "SELECT * FROM params_test WHERE value = ?",
        params: ["Value 2"],
      });

      assertEquals(response.status, 200);
      const data = await response.json();
      assertEquals(data.result.length, 1);
      assertEquals(data.result[0].value, "Value 2");
    });
  });
});
