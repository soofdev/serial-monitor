import { flashFirmware } from "./flash-api";
import type { FlashProgress } from "./types";

export class FlashPanel {
  readonly overlay: HTMLElement;

  private panel: HTMLElement;
  private fileDisplay: HTMLElement;
  private addrInput: HTMLInputElement;
  private flashBtn: HTMLButtonElement;
  private closeBtn: HTMLButtonElement;
  private progressContainer: HTMLElement;
  private progressFill: HTMLElement;
  private progressLabel: HTMLElement;
  private statusText: HTMLElement;

  private selectedFilePath: string | null = null;
  private port: string = "";
  private baudRate: number = 115200;
  private isFlashing = false;

  onFlashComplete: (() => void) | null = null;
  onClose: (() => void) | null = null;

  constructor() {
    // Overlay backdrop
    this.overlay = document.createElement("div");
    this.overlay.className = "flash-overlay";
    this.overlay.style.display = "none";

    // Panel card
    this.panel = document.createElement("div");
    this.panel.className = "flash-panel";

    // Header
    const header = document.createElement("div");
    header.className = "flash-header";

    const title = document.createElement("span");
    title.className = "flash-title";
    title.textContent = "Flash Firmware";
    header.appendChild(title);

    this.closeBtn = document.createElement("button");
    this.closeBtn.className = "flash-close-btn";
    this.closeBtn.textContent = "\u00D7";
    this.closeBtn.addEventListener("click", () => this.hide());
    header.appendChild(this.closeBtn);

    this.panel.appendChild(header);

    // File row
    const fileRow = document.createElement("div");
    fileRow.className = "flash-row";

    const fileLabel = document.createElement("label");
    fileLabel.textContent = "Firmware";
    fileLabel.className = "flash-label";
    fileRow.appendChild(fileLabel);

    this.fileDisplay = document.createElement("div");
    this.fileDisplay.className = "flash-file-display";
    this.fileDisplay.textContent = "No file selected";
    fileRow.appendChild(this.fileDisplay);

    const browseBtn = document.createElement("button");
    browseBtn.className = "toolbar-btn";
    browseBtn.textContent = "Browse...";
    browseBtn.addEventListener("click", () => this.browseFile());
    fileRow.appendChild(browseBtn);

    this.panel.appendChild(fileRow);

    // Address row
    const addrRow = document.createElement("div");
    addrRow.className = "flash-row";

    const addrLabel = document.createElement("label");
    addrLabel.textContent = "Address";
    addrLabel.className = "flash-label";
    addrRow.appendChild(addrLabel);

    this.addrInput = document.createElement("input");
    this.addrInput.className = "flash-addr-input";
    this.addrInput.type = "text";
    this.addrInput.value = "0x10000";
    this.addrInput.placeholder = "0x10000";
    addrRow.appendChild(this.addrInput);

    const addrHint = document.createElement("span");
    addrHint.className = "flash-hint";
    addrHint.textContent = "App partition offset";
    addrRow.appendChild(addrHint);

    this.panel.appendChild(addrRow);

    // Flash button
    this.flashBtn = document.createElement("button");
    this.flashBtn.className = "flash-btn";
    this.flashBtn.textContent = "Flash Firmware";
    this.flashBtn.addEventListener("click", () => this.startFlash());
    this.panel.appendChild(this.flashBtn);

    // Progress container (hidden initially)
    this.progressContainer = document.createElement("div");
    this.progressContainer.className = "flash-progress-container";
    this.progressContainer.style.display = "none";

    const progressTrack = document.createElement("div");
    progressTrack.className = "flash-progress-bar";

    this.progressFill = document.createElement("div");
    this.progressFill.className = "flash-progress-fill";
    progressTrack.appendChild(this.progressFill);

    this.progressContainer.appendChild(progressTrack);

    this.progressLabel = document.createElement("div");
    this.progressLabel.className = "flash-progress-label";
    this.progressLabel.textContent = "0%";
    this.progressContainer.appendChild(this.progressLabel);

    this.panel.appendChild(this.progressContainer);

    // Status text
    this.statusText = document.createElement("div");
    this.statusText.className = "flash-status";
    this.panel.appendChild(this.statusText);

    this.overlay.appendChild(this.panel);
  }

  show(port: string, baudRate: number): void {
    this.port = port;
    this.baudRate = baudRate;
    this.reset();
    this.overlay.style.display = "flex";
  }

  hide(): void {
    if (this.isFlashing) return; // Don't close during flash
    this.overlay.style.display = "none";
    this.onClose?.();
  }

  private reset(): void {
    this.selectedFilePath = null;
    this.fileDisplay.textContent = "No file selected";
    this.addrInput.value = "0x10000";
    this.flashBtn.disabled = false;
    this.flashBtn.textContent = "Flash Firmware";
    this.progressContainer.style.display = "none";
    this.progressFill.style.width = "0%";
    this.progressFill.className = "flash-progress-fill";
    this.progressLabel.textContent = "0%";
    this.statusText.textContent = "";
    this.statusText.className = "flash-status";
    this.closeBtn.disabled = false;
    this.isFlashing = false;
  }

  private async browseFile(): Promise<void> {
    if (this.isFlashing) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        filters: [
          { name: "Firmware Files", extensions: ["bin"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });
      if (selected) {
        this.selectedFilePath = selected;
        // Show just the filename
        const parts = selected.replace(/\\/g, "/").split("/");
        this.fileDisplay.textContent = parts[parts.length - 1];
        this.fileDisplay.title = selected;
      }
    } catch (e) {
      this.showStatus(`Browse failed: ${e}`, "error");
    }
  }

  private async startFlash(): Promise<void> {
    if (!this.selectedFilePath) {
      this.showStatus("Please select a firmware file first", "error");
      return;
    }

    // Parse the flash address
    const addrStr = this.addrInput.value.trim();
    const flashAddr = parseInt(addrStr, addrStr.startsWith("0x") ? 16 : 10);
    if (isNaN(flashAddr) || flashAddr < 0) {
      this.showStatus("Invalid flash address", "error");
      return;
    }

    this.isFlashing = true;
    this.flashBtn.disabled = true;
    this.flashBtn.textContent = "Flashing...";
    this.closeBtn.disabled = true;
    this.progressContainer.style.display = "block";
    this.showStatus("Connecting to bootloader...", "info");

    try {
      await flashFirmware(
        this.port,
        this.selectedFilePath,
        flashAddr,
        this.baudRate > 115200 ? this.baudRate : null,
        (progress: FlashProgress) => this.updateProgress(progress)
      );

      // Flash succeeded
      this.progressFill.style.width = "100%";
      this.progressFill.classList.add("flash-progress-success");
      this.progressLabel.textContent = "100%";
      this.showStatus("Flash complete! Reconnecting...", "success");
      this.flashBtn.textContent = "Done";
      this.closeBtn.disabled = false;
      this.isFlashing = false;

      // Trigger reconnect after a short delay
      setTimeout(() => {
        this.onFlashComplete?.();
      }, 2000);
    } catch (e) {
      this.progressFill.classList.add("flash-progress-error");
      this.showStatus(`Flash failed: ${e}`, "error");
      this.flashBtn.disabled = false;
      this.flashBtn.textContent = "Retry";
      this.closeBtn.disabled = false;
      this.isFlashing = false;
    }
  }

  private updateProgress(progress: FlashProgress): void {
    this.progressFill.style.width = `${progress.percentage}%`;
    this.progressLabel.textContent = `${Math.round(progress.percentage)}%`;
    this.showStatus(progress.message, "info");
  }

  private showStatus(message: string, type: "info" | "error" | "success"): void {
    this.statusText.textContent = message;
    this.statusText.className = `flash-status flash-status-${type}`;
  }
}
