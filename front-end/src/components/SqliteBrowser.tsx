import { createSignal, onMount } from "solid-js";
import { initTestDatabases } from "../db/init";
import styles from "./SqliteBrowser.module.css";
import { z } from "zod";
import { Kysely, sql } from "kysely";
import { DB } from "../../db";

const QueryResultSchema = z.array(z.record(z.unknown()));
type QueryResult = z.infer<typeof QueryResultSchema>;

interface DatabaseInfo {
  name: string;
  kysely: Kysely<DB>;
}

export function SqliteBrowser() {
  const [query, setQuery] = createSignal("");
  const [results, setResults] = createSignal<QueryResult>([]);
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [selectedDatabase, setSelectedDatabase] = createSignal(0);
  const [databases, setDatabases] = createSignal<DatabaseInfo[]>([]);

  onMount(async () => {
    const { db1, db2 } = await initTestDatabases();
    setDatabases([
      { name: "Database 1", kysely: db1.kysely },
      { name: "Database 2", kysely: db2.kysely },
    ]);
  });

  const executeQuery = async () => {
    if (!query()) {
      setError("Please enter a query");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const selectedDb = databases()[selectedDatabase()];
      if (!selectedDb) {
        throw new Error("No database selected");
      }

      // Simple query validation
      const queryText = query().trim().toLowerCase();

      const result = await sql<unknown>`${sql.raw(query())}`.execute(
        selectedDb.kysely
      );

      let queryResults: QueryResult = [];

      // Handle rows if any were returned
      if (result.rows.length > 0) {
        try {
          queryResults = QueryResultSchema.parse(result.rows);
        } catch (err) {
          console.error("Failed to parse query results:", err);
          queryResults = [];
        }
      }

      const additionalInfo: QueryResult = [];
      if (result.numAffectedRows) {
        additionalInfo.push({
          result: `Query affected ${result.numAffectedRows} rows.`,
        });
      }
      if (result.insertId) {
        additionalInfo.push({
          result: `Insert ID: ${result.insertId}`,
        });
      }

      const finalResults = [...queryResults, ...additionalInfo];

      // If there are no results to show, add a success message
      if (finalResults.length === 0) {
        setResults([{ result: "Query executed successfully." }]);
      } else {
        setResults(finalResults);
      }
    } catch (err) {
      console.error("Query execution error:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
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
        <div class={styles.exampleQueries}>
          {exampleQueries.map((q) => (
            <button class={styles.exampleButton} onClick={() => setQuery(q)}>
              {q}
            </button>
          ))}
        </div>
        <div class={styles.databaseSelector}>
          <select
            value={selectedDatabase()}
            onChange={(e) => setSelectedDatabase(Number(e.currentTarget.value))}
          >
            {databases().map((db, index) => (
              <option value={index}>{db.name}</option>
            ))}
          </select>
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
                      <td>
                        {typeof value === "object" && value !== null
                          ? JSON.stringify(value)
                          : String(value === null ? "NULL" : value)}
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
