import { Component, createSignal, For } from "solid-js";
import styles from "./AddItemForm.module.css";

interface Props {
  suggestions: string[];
  onAdd: (name: string) => void;
}

export const AddItemForm: Component<Props> = (props) => {
  const [input, setInput] = createSignal("");
  const [showSuggestions, setShowSuggestions] = createSignal(false);

  const filteredSuggestions = () =>
    props.suggestions.filter((s) =>
      s.toLowerCase().includes(input().toLowerCase())
    );

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (input().trim()) {
      debugger;
      props.onAdd(input().trim());
      setInput("");
    }
  };

  return (
    <form onSubmit={handleSubmit} class={styles.form}>
      <p>sugg: {props.suggestions}</p>
      <input
        type="text"
        value={input()}
        onInput={(e) => {
          setInput(e.currentTarget.value);
          setShowSuggestions(true);
        }}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder="Add item..."
        class={styles.input}
      />

      {showSuggestions() && input() && (
        <div class={styles.suggestions}>
          <For each={filteredSuggestions()}>
            {(suggestion) => (
              <div
                class={styles.suggestion}
                onClick={() => {
                  setInput(suggestion);
                  setShowSuggestions(false);
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
