import type { Component } from "solid-js";
import { createSignal } from "solid-js";
import styles from "./SyncButton.module.css";

export type SyncStatus =
  | { type: "failure"; message: string }
  | { type: "idle" }
  | { type: "offline" }
  | { type: "success" }
  | { type: "syncing" };

type SyncButtonProps = {
  status: SyncStatus;
  onClick: () => void;
};

export const SyncButton: Component<SyncButtonProps> = (props) => {
  const [showTooltip, setShowTooltip] = createSignal(false);

  const getButtonClass = () => {
    const baseClass = styles[`syncButton`];
    const statusClass = styles[props.status.type];
    return `${baseClass ?? ``} ${statusClass ?? ``}`.trim();
  };

  const getTooltipText = () => {
    switch (props.status.type) {
      case `idle`:
        return `Click to sync`;
      case `syncing`:
        return `Syncing...`;
      case `offline`:
        return `No internet connection`;
      case `success`:
        return `Sync successful`;
      case `failure`:
        return props.status.message;
      default:
        return ``;
    }
  };

  const handleClick = () => {
    if (props.status.type !== `syncing`) {
      props.onClick();
    }
  };

  const handleMouseEnter = () => setShowTooltip(true);
  const handleMouseLeave = () => setShowTooltip(false);
  const handleFocus = () => setShowTooltip(true);
  const handleBlur = () => setShowTooltip(false);

  return (
    <div class={styles[`container`]}>
      <button
        class={getButtonClass()}
        disabled={props.status.type === `syncing`}
        onBlur={handleBlur}
        onClick={handleClick}
        onFocus={handleFocus}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        title={getTooltipText()}
        type="button"
      >
        {/* Cloud icon SVG */}
        <svg
          class={styles[`icon`]}
          fill="currentColor"
          height="20"
          viewBox="0 0 24 24"
          width="20"
        >
          <path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
        </svg>
      </button>
      {showTooltip() && <div class={styles[`tooltip`]}>{getTooltipText()}</div>}
    </div>
  );
};
