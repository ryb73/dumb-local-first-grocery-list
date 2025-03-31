import { defined } from "@ryb73/super-duper-parakeet/lib/src/type-checks";
import type { Component } from "solid-js";
import { For, createSignal } from "solid-js";
import styles from "./AddItemForm.module.css";

type Props = {
  onAdd: (name: string) => void;
  suggestions: string[];
};

export const AddItemForm: Component<Props> = (props) => {
  const [input, setInput] = createSignal(``);
  const [showSuggestions, setShowSuggestions] = createSignal(false);

  const filteredSuggestions = () =>
    props.suggestions.filter((s) =>
      s.toLowerCase().includes(input().toLowerCase())
    );

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (input().trim()) {
      props.onAdd(input().trim());
      setInput(``);
    }
  };

  return (
    <form class={defined(styles[`form`])} onSubmit={handleSubmit}>
      <input
        class={defined(styles[`input`])}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        onInput={(e) => {
          setInput(e.currentTarget.value);
          setShowSuggestions(true);
        }}
        placeholder="Add item..."
        type="text"
        value={input()}
      />

      {showSuggestions() && input() && (
        <div class={defined(styles[`suggestions`])}>
          <For each={filteredSuggestions()}>
            {(suggestion) => (
              <div
                class={defined(styles[`suggestion`])}
                onClick={() => {
                  setInput(``);
                  setShowSuggestions(false);
                  props.onAdd(suggestion);
                }}
              >
                {suggestion}
              </div>
            )}
          </For>
        </div>
      )}
    </form>
  );
};
