import QRCode from "qrcode";
import type { Component } from "solid-js";
import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import styles from "./ShareButton.module.css";

type ShareButtonProps = {
  listId: string;
  onCopyError: (error: Error) => void;
  onCopySuccess: () => void;
};

export const ShareButton: Component<ShareButtonProps> = (props) => {
  const [showPopover, setShowPopover] = createSignal(false);
  let popoverRef: HTMLDivElement | undefined;
  let buttonRef: HTMLButtonElement | undefined;
  let canvasRef: HTMLCanvasElement | undefined;

  const getShareUrl = () => {
    const urlOrigin = window.location.origin;
    return `${urlOrigin}/list/${props.listId}`;
  };

  // Generate QR code when popover is shown
  createEffect(() => {
    if (showPopover() && canvasRef !== undefined) {
      QRCode.toCanvas(
        canvasRef,
        getShareUrl(),
        {
          width: 512,
          margin: 2,
          color: {
            dark: `#000000`,
            light: `#FFFFFF`,
          },
        },
        (error) => {
          if (error !== null && error !== undefined) {
            console.error(`QR code generation failed:`, error);
          }
        }
      );
    }
  });

  const handleButtonClick = () => {
    setShowPopover(!showPopover());
  };

  const handleCopyClick = async () => {
    try {
      await navigator.clipboard.writeText(getShareUrl());
      props.onCopySuccess();
      setShowPopover(false);
    } catch (error) {
      props.onCopyError(
        error instanceof Error
          ? error
          : new Error(`Failed to copy to clipboard`)
      );
    }
  };

  const handleCloseClick = () => {
    setShowPopover(false);
  };

  const handleClickOutside = (event: MouseEvent) => {
    if (
      popoverRef !== undefined &&
      buttonRef !== undefined &&
      !popoverRef.contains(event.target as Node) &&
      !buttonRef.contains(event.target as Node)
    ) {
      setShowPopover(false);
    }
  };

  const handleEscapeKey = (event: KeyboardEvent) => {
    if (event.key === `Escape`) {
      setShowPopover(false);
    }
  };

  // Set up event listeners when popover is shown
  createEffect(() => {
    if (showPopover()) {
      document.addEventListener(`mousedown`, handleClickOutside);
      document.addEventListener(`keydown`, handleEscapeKey);

      onCleanup(() => {
        document.removeEventListener(`mousedown`, handleClickOutside);
        document.removeEventListener(`keydown`, handleEscapeKey);
      });
    }
  });

  return (
    <div class={styles[`container`]}>
      <button
        class={styles[`shareButton`]}
        onClick={handleButtonClick}
        ref={buttonRef}
        title="Share this list"
        type="button"
      >
        {/* Share icon SVG */}
        <svg
          class={styles[`icon`]}
          fill="currentColor"
          height="20"
          viewBox="0 0 24 24"
          width="20"
        >
          <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z" />
        </svg>
      </button>

      <Show when={showPopover()}>
        <div class={styles[`popover`]} ref={popoverRef}>
          <div class={styles[`popoverHeader`]}>
            <span class={styles[`popoverTitle`]}>Share this list</span>
            <button
              aria-label="Close"
              class={styles[`closeButton`]}
              onClick={handleCloseClick}
              type="button"
            >
              ✕
            </button>
          </div>
          <div class={styles[`popoverContent`]}>
            <div class={styles[`qrcodeContainer`]}>
              <canvas class={styles[`qrcodeCanvas`]} ref={canvasRef} />
            </div>
            <div class={styles[`urlDisplay`]}>{getShareUrl()}</div>
            <button
              class={styles[`copyButton`]}
              onClick={() => void handleCopyClick()}
              type="button"
            >
              Copy Link
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
};
