import { initMergedDatabase } from "@grocery-list/shared";
import { defined } from "@ryb73/super-duper-parakeet/lib/src/type-checks";
import { sql } from "kysely";
import { createResource, createSignal } from "solid-js";
import { SQLocalKysely } from "sqlocal/kysely";
import { z } from "zod";
import styles from "./SqliteBrowser.module.css";

const QueryResultSchema = z.array(z.record(z.unknown()));
type QueryResult = z.infer<typeof QueryResultSchema>;

export function SqliteBrowser() {
  const [databases] = createResource(async () => {
    const mergedDb1 = await initMergedDatabase(
      `grocery-list.log.sqlite3`,
      new SQLocalKysely(`grocery-list.sqlite3`).dialect,
      new SQLocalKysely(`grocery-list.log.sqlite3`).dialect
    );

    const mergedDb2 = await initMergedDatabase(
      `grocery-list-2.log.sqlite3`,
      new SQLocalKysely(`grocery-list-2.sqlite3`).dialect,
      new SQLocalKysely(`grocery-list-2.log.sqlite3`).dialect
    );

    return [
      { name: `Database 1 (Main + Op Log)`, kysely: mergedDb1 },
      { name: `Database 2 (Main + Op Log)`, kysely: mergedDb2 },
    ];
  });

  const [query, setQuery] = createSignal(``);
  const [results, setResults] = createSignal<QueryResult>([]);
  const [error, setError] = createSignal(``);
  const [loading, setLoading] = createSignal(false);
  const [selectedDatabase, setSelectedDatabase] = createSignal(0);

  const executeQuery = async () => {
    if (query() === ``) {
      setError(`Please enter a query`);
      return;
    }

    setError(``);
    setLoading(true);

    try {
      const selectedDb = databases()![selectedDatabase()];
      if (selectedDb == null) {
        throw new Error(`No database selected`);
      }

      const result = await sql<unknown>`${sql.raw(query())}`.execute(
        selectedDb.kysely
      );

      let queryResults: QueryResult = [];

      // Handle rows if any were returned
      if (result.rows.length > 0) {
        try {
          queryResults = QueryResultSchema.parse(result.rows);
        } catch (err) {
          console.error(`Failed to parse query results:`, err);
          queryResults = [];
        }
      }

      const additionalInfo: QueryResult = [];
      if (result.numAffectedRows != null) {
        additionalInfo.push({
          result: `Query affected ${result.numAffectedRows} rows.`,
        });
      }
      if (result.insertId != null) {
        additionalInfo.push({
          result: `Insert ID: ${result.insertId}`,
        });
      }

      const finalResults = [...queryResults, ...additionalInfo];

      // If there are no results to show, add a success message
      if (finalResults.length === 0) {
        setResults([{ result: `Query executed successfully.` }]);
      } else {
        setResults(finalResults);
      }
    } catch (err) {
      console.error(`Query execution error:`, err);
      setError(err instanceof Error ? err.message : `An error occurred`);
    } finally {
      setLoading(false);
    }
  };

  const exampleQueries = [
    // Main database queries
    `SELECT * FROM items`,
    `SELECT name, checked FROM items WHERE checked = 0`,
    `SELECT COUNT(*) as total_items FROM items`,

    // Operation log queries
    `SELECT * FROM op_log.operations ORDER BY client_created_at DESC LIMIT 10`,
    `SELECT type, COUNT(*) as count FROM op_log.operations GROUP BY type`,
    `SELECT id, type, client_created_at, server_committed_at FROM op_log.operations WHERE server_committed_at IS NULL`,
    `SELECT JSON_EXTRACT(payload, '$.item.name') as item_name FROM op_log.operations WHERE type = 'createItem' ORDER BY client_created_at DESC LIMIT 5`,

    // Combined queries
    `SELECT i.name, COUNT(op.id) as operation_count FROM items i LEFT JOIN op_log.operations op ON JSON_EXTRACT(op.payload, '$.itemId') = i.id OR JSON_EXTRACT(op.payload, '$.item.id') = i.id GROUP BY i.id, i.name`,

    // Utility queries
    `PRAGMA table_list`,
  ];

  return (
    <div class={defined(styles[`browser`])}>
      <div class={defined(styles[`header`])}>
        <h1>SQLite Browser</h1>
        <div class={defined(styles[`exampleQueries`])}>
          {exampleQueries.map((q) => (
            <button
              class={defined(styles[`exampleButton`])}
              onClick={() => setQuery(q)}
              type="button"
            >
              {q}
            </button>
          ))}
        </div>
        <div class={defined(styles[`databaseSelector`])}>
          <select
            onChange={(e) => setSelectedDatabase(Number(e.currentTarget.value))}
            value={selectedDatabase()}
          >
            {databases()?.map((db, index) => (
              <option value={index}>{db.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div class={defined(styles[`content`])}>
        <div class={defined(styles[`querySection`])}>
          <textarea
            class={defined(styles[`queryInput`])}
            onInput={(e) => setQuery(e.currentTarget.value)}
            placeholder="Enter your SQL query here..."
            value={query()}
          />
          <button
            class={defined(styles[`executeButton`])}
            disabled={loading()}
            onClick={() => void executeQuery()}
            type="button"
          >
            {loading() ? `Executing...` : `Execute Query`}
          </button>
        </div>
        {error() !== `` && (
          <div class={defined(styles[`error`])}>
            <p>Error: {error()}</p>
          </div>
        )}
        {results().length > 0 && (
          <div class={defined(styles[`results`])}>
            <table>
              <thead>
                <tr>
                  {Object.keys(results()[0]!).map((key) => (
                    <th>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results().map((row) => (
                  <tr>
                    {Object.values(row).map((value) => (
                      <td>
                        {typeof value === `object` && value !== null
                          ? JSON.stringify(value)
                          : String(value === null ? `NULL` : value)}
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
