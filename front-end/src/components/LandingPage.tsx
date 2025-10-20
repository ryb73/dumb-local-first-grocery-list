import { useNavigate } from "@solidjs/router";
import { type Component, For, Show, createSignal, onMount } from "solid-js";
import { createNewList } from "../registry/create-list.js";
import {
  type ListMetadata,
  getRecentListsWithMetadata,
} from "../registry/list-registry.js";
import { formatRelativeTime } from "../utils/format-relative-time.js";
import styles from "./LandingPage.module.css";

/**
 * Landing page for the grocery list application.
 * Allows users to create new lists and access previously created lists.
 */
export const LandingPage: Component = () => {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [isLoadingLists, setIsLoadingLists] = createSignal(true);
  const [recentLists, setRecentLists] = createSignal<ListMetadata[]>([]);

  const loadRecentLists = async () => {
    try {
      setIsLoadingLists(true);
      const lists = await getRecentListsWithMetadata();
      setRecentLists(lists);
    } catch (err) {
      console.error(`Failed to load recent lists:`, err);
    } finally {
      setIsLoadingLists(false);
    }
  };

  onMount(() => {
    void loadRecentLists();
  });

  const handleCreateNewList = () => {
    setIsCreating(true);
    setError(null);

    void createNewList()
      .then((listId) => navigate(`/list/${listId}`))
      .catch((err: unknown) => {
        console.error(`Failed to create new list:`, err);
        setError(`Failed to create new list. Please try again.`);
        setIsCreating(false);
      });
  };

  const handleListClick = (listId: string) => {
    navigate(`/list/${listId}`);
  };

  return (
    <div class={styles[`container`]}>
      <h1>Grocery Lists</h1>
      <div class={styles[`content`]}>
        <button
          class={styles[`createButton`]}
          disabled={isCreating()}
          onClick={handleCreateNewList}
          type="button"
        >
          {isCreating() ? `Creating...` : `Create New List`}
        </button>
        {error() != null && <p class={styles[`error`]}>{error()}</p>}

        <div class={styles[`recentListsSection`]}>
          <h2>Recently Accessed Lists</h2>
          <Show when={isLoadingLists()}>
            <div class={styles[`spinner`]} />
          </Show>
          <Show when={!isLoadingLists() && recentLists().length === 0}>
            <p class={styles[`emptyState`]}>
              No lists yet. Create your first list to get started!
            </p>
          </Show>
          <Show when={!isLoadingLists() && recentLists().length > 0}>
            <ul class={styles[`listContainer`]}>
              <For each={recentLists()}>
                {(list) => (
                  <li>
                    <button
                      class={styles[`listItem`]}
                      onClick={() => handleListClick(list.listId)}
                      type="button"
                    >
                      <div class={styles[`listName`]}>{list.name}</div>
                      <div class={styles[`listTimestamp`]}>
                        {formatRelativeTime(list.lastModified)}
                      </div>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      </div>
    </div>
  );
};
