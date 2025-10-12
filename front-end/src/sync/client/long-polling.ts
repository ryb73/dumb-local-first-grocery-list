/**
 * Long-polling client for listening to server-side change notifications.
 * This module handles establishing and maintaining long-polling connections
 * to the server's /changes/poll endpoint.
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
 * @param onChangesAvailable Callback to invoke when server changes are detected
 * @param onStatusChange Optional callback to invoke when connection status changes
 * @returns LongPollingListener instance
 */
export function createLongPollingListener(
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
      console.log(`Long-poll: Starting request to ${serverUrl}/changes/poll`);

      abortController = new AbortController();

      const response = await fetch(`${serverUrl}/changes/poll`, {
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
        return isRunning; // Continue polling after a delay
      }

      const responseData = await response.json();
      const result = longPollingResponseSchema.parse(responseData);
      console.log(`Long-poll: Response received`, result);

      if (result.hasChanges) {
        console.log(`Long-poll: Changes detected, triggering callback`);
        onChangesAvailable();
      }

      // Continue polling regardless of whether changes were detected
      return isRunning;
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!isRunning) {
        // Polling was stopped, this is expected
        return false;
      }

      const errorMessage =
        error instanceof Error ? error.message : `Unknown error`;
      console.error(`Long-poll: Error occurred - ${errorMessage}`);
      setStatus({ type: `error`, error: errorMessage });

      // Continue polling after a delay on error
      return true;
    }
  };

  /**
   * Main polling loop with error handling and reconnection logic.
   */
  const pollLoop = async () => {
    console.log(`Long-poll: Starting polling loop`);
    setStatus({ type: `connected` });

    while (isRunning) {
      const shouldContinue = await pollOnce();

      isRunning &&= shouldContinue;

      // If there was an error, wait before retrying
      if (currentStatus.type === `error` && isRunning) {
        console.log(`Long-poll: Waiting 5 seconds before retry due to error`);
        await new Promise((resolve) => {
          setTimeout(resolve, 5000);
        });

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (isRunning) {
          setStatus({ type: `connected` });
        }
      }
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
