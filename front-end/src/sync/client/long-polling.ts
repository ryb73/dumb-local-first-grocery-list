/**
 * Long-polling client for listening to server-side change notifications.
 * This module handles establishing and maintaining long-polling connections
 * to the server's /list/:listId/changes/poll endpoint.
 */

import { longPollingResponseSchema } from "@grocery-list/shared";

export type LongPollingStatus =
  | { type: "connected" }
  | { type: "disconnected"; reason: string }
  | { type: "error"; error: string };

export type LongPollingListener = {
  /**
   * Starts the long-polling loop.
   * Will continuously poll the server until stop() is called.
   */
  start: () => void;

  /**
   * Stops the long-polling loop.
   */
  stop: () => void;

  /**
   * Current status of the long-polling connection.
   */
  status: LongPollingStatus;
};

const getServerUrl = (): string =>
  // TODO: parse import.meta.env[`VITE_SERVER_URL`] as a string (if defined)
  (import.meta.env[`VITE_SERVER_URL`] as string | undefined) ??
  `http://localhost:3001`;

/**
 * Creates a long-polling listener that will call the provided callback
 * whenever the server indicates that changes are available.
 *
 * @param listId The ID of the list to listen for changes on
 * @param getServerVersion Function to get the current server version the client has synced to
 * @param onChangesAvailable Callback to invoke when server changes are detected
 * @param onStatusChange Optional callback to invoke when connection status changes
 * @returns LongPollingListener instance
 */
export function createLongPollingListener(
  listId: string,
  getServerVersion: () => Promise<number | null>,
  onChangesAvailable: () => void,
  onStatusChange?: (status: LongPollingStatus) => void
): LongPollingListener {
  let isRunning = false;
  let abortController: AbortController | null = null;
  let currentStatus: LongPollingStatus = {
    type: `disconnected`,
    reason: `Not started`,
  };

  const setStatus = (status: LongPollingStatus) => {
    currentStatus = status;
    onStatusChange?.(status);
  };

  /**
   * Single long-polling request cycle.
   * Returns true if should continue polling, false if should stop.
   */
  const pollOnce = async (): Promise<boolean> => {
    if (!isRunning) return false;

    try {
      const serverUrl = getServerUrl();
      const serverVersion = await getServerVersion();

      // Build query parameters - always include expectedServerVersion
      // For null, we explicitly send the string 'null'
      // For numbers, we convert to string
      const queryParams = new URLSearchParams({
        expectedServerVersion:
          serverVersion === null ? `null` : serverVersion.toString(),
        // Because we render the list twice, and each list has its own long-polling connection,
        // we include this unique request ID so that the browser considers them separate requests.
        uniqueRequestId: crypto.randomUUID(),
      });

      const pollEndpoint = `${serverUrl}/list/${listId}/changes/poll?${queryParams.toString()}`;
      console.log(`Long-poll: Starting request to ${pollEndpoint}`);

      abortController = new AbortController();

      const response = await fetch(pollEndpoint, {
        method: `GET`,
        headers: {
          "Content-Type": `application/json`,
        },
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        console.error(`Long-poll: Request failed - ${errorMessage}`);
        setStatus({ type: `error`, error: errorMessage });
        return false; // Stop polling on error
      }

      const responseData = await response.json();
      const result = longPollingResponseSchema.parse(responseData);
      console.log(`Long-poll: Response received:`, result);

      if (result.hasChanges) {
        console.log(`Long-poll: Changes detected, triggering callback`);
        onChangesAvailable();
      } else {
        console.log(`Long-poll: No changes detected, continuing polling`);
      }

      // Continue polling regardless of whether changes were detected
      return isRunning;
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!isRunning) {
        // Polling was stopped, this is expected
        console.log(`Long-poll: Polling stopped (abort expected)`);
        return false;
      }

      const errorMessage =
        error instanceof Error ? error.message : `Unknown error`;
      console.error(`Long-poll: Error occurred - ${errorMessage}`);
      setStatus({ type: `error`, error: errorMessage });

      // Stop polling on error
      return false;
    }
  };

  /**
   * Main polling loop with error handling.
   */
  const pollLoop = async () => {
    console.log(`Long-poll: Starting polling loop`);
    setStatus({ type: `connected` });

    while (isRunning) {
      const shouldContinue = await pollOnce();
      isRunning &&= shouldContinue;
    }

    console.log(`Long-poll: Polling loop ended`);
    setStatus({ type: `disconnected`, reason: `Stopped` });
  };

  return {
    start() {
      if (isRunning) {
        console.warn(`Long-poll: Already running`);
        return;
      }

      console.log(`Long-poll: Starting`);
      isRunning = true;
      pollLoop().catch((error: unknown) => {
        console.error(`Long-poll: Unexpected error in polling loop`, error);
        setStatus({
          type: `error`,
          error: error instanceof Error ? error.message : `Unknown error`,
        });
        isRunning = false;
      });
    },

    stop() {
      if (!isRunning) {
        console.warn(`Long-poll: Not running`);
        return;
      }

      console.log(`Long-poll: Stopping`);
      isRunning = false;

      if (abortController != null) {
        abortController.abort();
        abortController = null;
      }
    },

    get status() {
      return currentStatus;
    },
  };
}
