import { createSignal, onMount } from "solid-js";
import { initDatabase } from "../db/init";
import styles from "./SqliteBrowser.module.css";
import { z } from "zod";
import { sql } from "kysely"; // Add the sql import from Kysely

const QueryResultSchema = z.array(z.record(z.unknown()));
type QueryResult = z.infer<typeof QueryResultSchema>;

const { kysely } = await initDatabase();

export function SqliteBrowser() {
  const [query, setQuery] = createSignal("");
  const [results, setResults] = createSignal<QueryResult>([]);
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [dbStatus, setDbStatus] = createSignal("Checking database...");

  onMount(async () => {
    try {
      // Check if items table exists
      setDbStatus("Checking database tables...");
      const tables = await kysely.introspection.getTables();
      const itemsTableExists = tables.some(table => table.name === 'items');

      if (itemsTableExists) {
        setDbStatus("Database ready - 'items' table exists");
      } else {
        setDbStatus("Warning: 'items' table not found. Run migrations first.");

        // Initialize the database if needed
        await initDatabase();
        setDbStatus("Database initialized");
      }
    } catch (err) {
      setDbStatus(`Database error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  const executeQuery = async () => {
    if (!query()) {
      setError("Please enter a query");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Simple query validation
      const queryText = query().trim().toLowerCase();

      const result = await sql<unknown>`${query()}`.execute(kysely)

      if (queryText.startsWith("select")) {

        const rows = result.rows;

        try {
          // Validate the results
          const validatedResults = QueryResultSchema.parse(rows);
          setResults(validatedResults);
        } catch (validationError) {
          console.error("Result validation error:", validationError);
          setResults(rows as QueryResult); // Fallback to using the raw results
        }
      } else {

        setResults([{ result: "Query executed successfully" }]);
      }

      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const exampleQueries = [
    "SELECT * FROM items",
    "SELECT name, checked FROM items WHERE checked = 0",
    "SELECT COUNT(*) as total_items FROM items",
    "PRAGMA table_list",
  ];

  return (
    <div class={styles.browser}>
      <div class={styles.header}>
        <h1>SQLite Browser</h1>
        <div class={styles.status}>
          <p>{dbStatus()}</p>
        </div>
        <div class={styles.exampleQueries}>
          {exampleQueries.map((q) => (
            <button
              class={styles.exampleButton}
              onClick={() => setQuery(q)}
            >
              {q}
            </button>
          ))}
        </div>
      </div>
      <div class={styles.content}>
        <div class={styles.querySection}>
          <textarea
            class={styles.queryInput}
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            placeholder="Enter your SQL query here..."
          />
          <button
            class={styles.executeButton}
            onClick={executeQuery}
            disabled={loading()}
          >
            {loading() ? "Executing..." : "Execute Query"}
          </button>
        </div>
        {error() && (
          <div class={styles.error}>
            <p>Error: {error()}</p>
          </div>
        )}
        {results().length > 0 && (
          <div class={styles.results}>
            <table>
              <thead>
                <tr>
                  {Object.keys(results()[0]).map((key) => (
                    <th>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results().map((row) => (
                  <tr>
                    {Object.values(row).map((value) => (
                      <td>{typeof value === 'object' && value !== null
                        ? JSON.stringify(value)
                        : String(value === null ? 'NULL' : value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
