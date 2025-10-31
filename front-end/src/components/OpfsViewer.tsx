/* eslint-disable no-unsanitized/property */
/* eslint-disable no-alert */
/* eslint-disable sort-class-members/sort-class-members */
import { defined } from "@ryb73/super-duper-parakeet/lib/src/type-checks";
import { onCleanup, onMount } from "solid-js";
import styles from "./OpfsViewer.module.css";

type FileInfo = {
  name: string;
  size: number;
  handle: FileSystemFileHandle;
};

/**
 * OPFS Viewer - A simple interface to view and manage Origin Private File System files
 */
class OPFSViewer {
  private fileList: FileInfo[] = [];
  private rootHandle: FileSystemDirectoryHandle | null = null;
  private refreshHandler = () => this.refreshFiles();
  private clearAllHandler = () => this.clearAllFiles();

  public constructor() {
    void this.init();
  }

  private async init(): Promise<void> {
    if (!this.isOPFSSupported()) {
      this.showError(`OPFS is not supported in this browser`);
      return;
    }

    try {
      this.rootHandle = await navigator.storage.getDirectory();
      this.setupEventListeners();
    } catch (error) {
      this.showError(`Failed to access OPFS: ${String(error)}`);
    }
  }

  private isOPFSSupported(): boolean {
    return `storage` in navigator && `getDirectory` in navigator.storage;
  }

  private setupEventListeners(): void {
    const refreshBtn = document.getElementById(`opfs-refresh-btn`);
    const clearAllBtn = document.getElementById(`opfs-clear-all-btn`);

    refreshBtn?.addEventListener(`click`, this.refreshHandler);
    clearAllBtn?.addEventListener(`click`, this.clearAllHandler);
  }

  /**
   * Remove event listeners to prevent memory leaks
   */
  public cleanup(): void {
    const refreshBtn = document.getElementById(`opfs-refresh-btn`);
    const clearAllBtn = document.getElementById(`opfs-clear-all-btn`);

    refreshBtn?.removeEventListener(`click`, this.refreshHandler);
    clearAllBtn?.removeEventListener(`click`, this.clearAllHandler);
  }

  /**
   * Refresh the file list from OPFS
   */
  private async refreshFiles(): Promise<void> {
    if (this.rootHandle == null) return;

    try {
      this.clearError();
      const files: FileInfo[] = [];

      for await (const [name, handle] of this.rootHandle.entries()) {
        if (handle.kind === `file`) {
          const file = await (handle as FileSystemFileHandle).getFile();
          files.push({
            name,
            size: file.size,
            handle: handle as FileSystemFileHandle,
          });
        }
      }

      this.fileList = files;
      this.renderFileList();
    } catch (error) {
      this.showError(`Failed to read files: ${String(error)}`);
    }
  }

  /**
   * Delete a specific file from OPFS
   */
  public async deleteFile(fileName: string): Promise<void> {
    if (this.rootHandle == null) return;

    try {
      await this.rootHandle.removeEntry(fileName);
      this.fileList = this.fileList.filter((file) => file.name !== fileName);
      this.renderFileList();
    } catch (error) {
      this.showError(`Failed to delete file ${fileName}: ${String(error)}`);
    }
  }

  /**
   * Download a specific file from OPFS
   */
  public async downloadFile(fileName: string): Promise<void> {
    const fileInfo = this.fileList.find((file) => file.name === fileName);
    if (fileInfo == null) {
      this.showError(`File ${fileName} not found`);
      return;
    }

    try {
      const file = await fileInfo.handle.getFile();
      const url = URL.createObjectURL(file);

      const a = document.createElement(`a`);
      a.href = url;
      a.download = fileName;
      a.style.display = `none`;

      document.body.append(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);
    } catch (error) {
      this.showError(`Failed to download file ${fileName}: ${String(error)}`);
    }
  }

  /**
   * Clear all files from OPFS
   */
  private async clearAllFiles(): Promise<void> {
    if (this.rootHandle == null) return;

    if (
      !confirm(
        `Are you sure you want to delete all files? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      const filesToDelete = Array.from(this.fileList);

      for (const file of filesToDelete) {
        await this.rootHandle.removeEntry(file.name);
      }

      this.fileList = [];
      this.renderFileList();
    } catch (error) {
      this.showError(`Failed to clear files: ${String(error)}`);
    }
  }

  /**
   * Render the file list in the UI
   */
  private renderFileList(): void {
    const fileListEl = document.getElementById(`opfs-file-list`);
    if (fileListEl == null) return;

    if (this.fileList.length === 0) {
      fileListEl.innerHTML = `<div class="${defined(
        styles[`emptyState`]
      )}">No files found in OPFS</div>`;
      return;
    }

    fileListEl.innerHTML = this.fileList
      .map(
        (file) => `
        <div class="${defined(styles[`fileItem`])}">
          <div>
            <div class="${defined(styles[`fileName`])}">${this.escapeHtml(
          file.name
        )}</div>
            <div class="${defined(styles[`fileSize`])}">${this.formatFileSize(
          file.size
        )}</div>
          </div>
          <div class="${defined(styles[`fileActions`])}">
            <button class="${defined(
              styles[`downloadBtn`]
            )}" data-action="download" data-filename="${this.escapeHtml(
          file.name
        )}">
              Download
            </button>
            <button class="${defined(
              styles[`deleteBtn`]
            )}" data-action="delete" data-filename="${this.escapeHtml(
          file.name
        )}">
              Delete
            </button>
          </div>
        </div>
      `
      )
      .join(``);

    // Add event listeners to dynamically created buttons
    fileListEl.querySelectorAll(`button[data-action]`).forEach((button) => {
      const action = button.getAttribute(`data-action`);
      const filename = button.getAttribute(`data-filename`);
      if (action != null && filename != null) {
        button.addEventListener(`click`, () => {
          if (action === `download`) {
            void this.downloadFile(filename);
          } else if (action === `delete`) {
            void this.deleteFile(filename);
          }
        });
      }
    });
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return `0 B`;

    const k = 1024;
    const sizes = [`B`, `KB`, `MB`, `GB`];
    // eslint-disable-next-line total-functions/no-partial-division
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    // eslint-disable-next-line total-functions/no-partial-division
    return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${defined(
      sizes[i]
    )}`;
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement(`div`);
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Show error message
   */
  private showError(message: string): void {
    const errorContainer = document.getElementById(`opfs-error-container`);
    if (errorContainer == null) return;

    errorContainer.innerHTML = `<div class="${defined(
      styles[`error`]
    )}">${this.escapeHtml(message)}</div>`;
  }

  /**
   * Clear error message
   */
  private clearError(): void {
    const errorContainer = document.getElementById(`opfs-error-container`);
    if (errorContainer != null) {
      errorContainer.innerHTML = ``;
    }
  }
}

/**
 * SolidJS wrapper component for the OPFS Viewer
 */
export const OpfsViewer = () => {
  let viewer: OPFSViewer | null = null;

  onMount(() => {
    viewer = new OPFSViewer();
  });

  onCleanup(() => {
    viewer?.cleanup();
    viewer = null;
  });

  return (
    <div class={styles[`container`]}>
      <h1 class={styles[`title`]}>OPFS Viewer</h1>

      <div class={styles[`controls`]}>
        <button class={styles[`button`]} id="opfs-refresh-btn" type="button">
          Refresh Files
        </button>
        <button class={styles[`button`]} id="opfs-clear-all-btn" type="button">
          Clear All Files
        </button>
      </div>

      <div id="opfs-error-container" />

      <div class={styles[`fileList`]} id="opfs-file-list">
        <div class={styles[`emptyState`]}>
          Click &quot;Refresh Files&quot; to load OPFS contents
        </div>
      </div>
    </div>
  );
};
