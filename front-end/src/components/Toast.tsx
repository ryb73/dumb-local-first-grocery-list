import type { Component, JSX } from "solid-js";
import { For, createContext, createSignal, useContext } from "solid-js";
import styles from "./Toast.module.css";

type ToastType = "error" | "info" | "success";

type ToastMessage = {
  id: number;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  showToast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue>();

export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error(`useToast must be used within a ToastProvider`);
  }
  return context;
};

type ToastProviderProps = {
  children: JSX.Element;
};

export const ToastProvider: Component<ToastProviderProps> = (props) => {
  const [toasts, setToasts] = createSignal<ToastMessage[]>([]);
  let nextId = 0;

  const showToast = (message: string, type: ToastType = `info`) => {
    const id = nextId++;
    const toast: ToastMessage = { id, message, type };

    setToasts((prev) => [...prev, toast]);

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  const dismissToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const contextValue: ToastContextValue = {
    showToast,
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {props.children}
      <div class={styles[`toastContainer`]}>
        <For each={toasts()}>
          {(toast) => (
            <div class={`${styles[`toast`] ?? ``} ${styles[toast.type] ?? ``}`}>
              <span class={styles[`message`]}>{toast.message}</span>
              <button
                aria-label="Dismiss"
                class={styles[`closeButton`]}
                onClick={() => dismissToast(toast.id)}
                type="button"
              >
                ✕
              </button>
            </div>
          )}
        </For>
      </div>
    </ToastContext.Provider>
  );
};
