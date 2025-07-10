/**
 * OPFS Viewer - A simple interface to view and manage Origin Private File System files
 */

type FileInfo = {
  name: string;
  size: number;
  handle: FileSystemFileHandle;
};

class OPFSViewer {
  private fileList: FileInfo[] = [];
  private rootHandle: FileSystemDirectoryHandle | null = null;

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    if (!this.isOPFSSupported()) {
      this.showError("OPFS is not supported in this browser");
      return;
    }

    try {
      this.rootHandle = await navigator.storage.getDirectory();
      this.setupEventListeners();
    } catch (error) {
      this.showError(`Failed to access OPFS: ${error}`);
    }
  }

  private isOPFSSupported(): boolean {
    return "storage" in navigator && "getDirectory" in navigator.storage;
  }

  private setupEventListeners(): void {
    const refreshBtn = document.getElementById("refresh-btn");
    const clearAllBtn = document.getElementById("clear-all-btn");

    refreshBtn?.addEventListener("click", () => this.refreshFiles());
    clearAllBtn?.addEventListener("click", () => this.clearAllFiles());
  }

  /**
   * Refresh the file list from OPFS
   */
  private async refreshFiles(): Promise<void> {
    if (!this.rootHandle) return;

    try {
      this.clearError();
      const files: FileInfo[] = [];

      for await (const [name, handle] of this.rootHandle.entries()) {
        if (handle.kind === "file") {
          const file = await handle.getFile();
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
      this.showError(`Failed to read files: ${error}`);
    }
  }

  /**
   * Delete a specific file from OPFS
   */
  public async deleteFile(fileName: string): Promise<void> {
    if (!this.rootHandle) return;

    try {
      await this.rootHandle.removeEntry(fileName);
      this.fileList = this.fileList.filter((file) => file.name !== fileName);
      this.renderFileList();
    } catch (error) {
      this.showError(`Failed to delete file ${fileName}: ${error}`);
    }
  }

  /**
   * Download a specific file from OPFS
   */
  public async downloadFile(fileName: string): Promise<void> {
    const fileInfo = this.fileList.find((file) => file.name === fileName);
    if (!fileInfo) {
      this.showError(`File ${fileName} not found`);
      return;
    }

    try {
      const file = await fileInfo.handle.getFile();
      const url = URL.createObjectURL(file);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.style.display = 'none';
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      URL.revokeObjectURL(url);
    } catch (error) {
      this.showError(`Failed to download file ${fileName}: ${error}`);
    }
  }

  /**
   * Clear all files from OPFS
   */
  private async clearAllFiles(): Promise<void> {
    if (!this.rootHandle) return;

    if (
      !confirm(
        "Are you sure you want to delete all files? This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      const filesToDelete = [...this.fileList];

      for (const file of filesToDelete) {
        await this.rootHandle.removeEntry(file.name);
      }

      this.fileList = [];
      this.renderFileList();
    } catch (error) {
      this.showError(`Failed to clear files: ${error}`);
    }
  }

  /**
   * Render the file list in the UI
   */
  private renderFileList(): void {
    const fileListEl = document.getElementById("file-list");
    if (!fileListEl) return;

    if (this.fileList.length === 0) {
      fileListEl.innerHTML =
        '<div class="empty-state">No files found in OPFS</div>';
      return;
    }

    fileListEl.innerHTML = this.fileList
      .map(
        (file) => `
        <div class="file-item">
          <div>
            <div class="file-name">${this.escapeHtml(file.name)}</div>
            <div class="file-size">${this.formatFileSize(file.size)}</div>
          </div>
          <div class="file-actions">
            <button class="download-btn" onclick="viewer.downloadFile('${this.escapeHtml(
              file.name
            )}')">
              Download
            </button>
            <button class="delete-btn" onclick="viewer.deleteFile('${this.escapeHtml(
              file.name
            )}')">
              Delete
            </button>
          </div>
        </div>
      `
      )
      .join("");
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 B";

    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Show error message
   */
  private showError(message: string): void {
    const errorContainer = document.getElementById("error-container");
    if (!errorContainer) return;

    errorContainer.innerHTML = `<div class="error">${this.escapeHtml(
      message
    )}</div>`;
  }

  /**
   * Clear error message
   */
  private clearError(): void {
    const errorContainer = document.getElementById("error-container");
    if (errorContainer) {
      errorContainer.innerHTML = "";
    }
  }
}

// Initialize the viewer
const viewer = new OPFSViewer();

// Make viewer globally accessible for HTML onclick handlers
(window as any).viewer = viewer;
