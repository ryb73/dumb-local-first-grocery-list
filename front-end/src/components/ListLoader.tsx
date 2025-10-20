import type { Component } from "solid-js";
import { Show, createResource } from "solid-js";
import {
  addListToRegistry,
  listExistsLocally,
} from "../registry/list-registry.js";
import { checkListExists } from "../sync/index.js";
import { ListNotFound } from "./ListNotFound.js";
import { ParallelGroceryLists } from "./ParallelGroceryLists.js";

type ListLoaderProps = {
  listId: string;
};

type LoadResult = {
  exists: boolean;
};

/**
 * Component that handles loading a list by checking if it exists locally or on the server.
 * Implements the "Accessing a Shared List" flow from the PRD.
 */
export const ListLoader: Component<ListLoaderProps> = (props) => {
  const [loadResult] = createResource(async (): Promise<LoadResult> => {
    // Step 1: Check if list exists locally (in registry)
    const existsLocally = listExistsLocally(props.listId);

    if (existsLocally) {
      console.log(`List ${props.listId} found in local registry`);
      return { exists: true };
    }

    console.log(`List ${props.listId} not found locally, checking server...`);

    // Step 2: Check if list exists on server
    const existsOnServer = await checkListExists(props.listId);

    if (existsOnServer) {
      console.log(`List ${props.listId} found on server`);
      // Add to registry so it appears in "Recently Accessed Lists"
      addListToRegistry(props.listId);
      return { exists: true };
    }

    console.log(`List ${props.listId} not found on server`);
    return { exists: false };
  });

  return (
    <Show fallback={<div>Loading...</div>} when={loadResult()}>
      {(result) => (
        <Show fallback={<ListNotFound />} when={result().exists}>
          <ParallelGroceryLists listId={props.listId} />
        </Show>
      )}
    </Show>
  );
};
