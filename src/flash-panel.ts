import { flashFirmware, parseIdfProject, flashIdfProject } from "./flash-api";
import type { FlashProgress, IdfProjectInfo } from "./types";

type FlashMode = "single" | "idf";

export class FlashPanel {
  readonly overlay: HTMLElement;

  private panel: HTMLElement;
  private closeBtn: HTMLButtonElement;
  private progressContainer: HTMLElement;
  private progressFill: HTMLElement;
  private progressLabel: HTMLElement;
  private statusText: HTMLElement;
  private flashBtn: HTMLButtonElement;

  // Mode tabs
  private singleTab: HTMLButtonElement;
  private idfTab: HTMLButtonElement;
  private singleContent: HTMLElement;
  private idfContent: HTMLElement;

  // Single file mode
  private fileDisplay: HTMLElement;
  private addrInput: HTMLInputElement;
  private selectedFilePath: string | null = null;

  // IDF project mode
  private buildDirDisplay: HTMLElement;
  private segmentsTable: HTMLElement;
  private appOnlyCheckbox: HTMLInputElement;
  private projectInfo: IdfProjectInfo | null = null;
  private selectedBuildDir: string | null = null;

  private port: string = "";
  private baudRate: number = 115200;
  private isFlashing = false;
  private mode: FlashMode = "idf";

  onFlashComplete: (() => void) | null = null;
  onClose: (() => void) | null = null;

  constructor() {
    this.overlay = document.createElement("div");
    this.overlay.className = "flash-overlay";
    this.overlay.style.display = "none";

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

    // Mode tabs
    const tabs = document.createElement("div");
    tabs.className = "flash-tabs";

    this.idfTab = document.createElement("button");
    this.idfTab.className = "flash-tab flash-tab-active";
    this.idfTab.textContent = "ESP-IDF Project";
    this.idfTab.addEventListener("click", () => this.setMode("idf"));
    tabs.appendChild(this.idfTab);

    this.singleTab = document.createElement("button");
    this.singleTab.className = "flash-tab";
    this.singleTab.textContent = "Single .bin";
    this.singleTab.addEventListener("click", () => this.setMode("single"));
    tabs.appendChild(this.singleTab);

    this.panel.appendChild(tabs);

    // === Single file content ===
    this.singleContent = document.createElement("div");
    this.singleContent.className = "flash-mode-content";
    this.singleContent.style.display = "none";

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
    browseBtn.addEventListener("click", () => this.browseBinFile());
    fileRow.appendChild(browseBtn);
    this.singleContent.appendChild(fileRow);

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
    this.singleContent.appendChild(addrRow);

    this.panel.appendChild(this.singleContent);

    // === IDF project content ===
    this.idfContent = document.createElement("div");
    this.idfContent.className = "flash-mode-content";

    const buildRow = document.createElement("div");
    buildRow.className = "flash-row";
    const buildLabel = document.createElement("label");
    buildLabel.textContent = "Build Dir";
    buildLabel.className = "flash-label";
    buildRow.appendChild(buildLabel);
    this.buildDirDisplay = document.createElement("div");
    this.buildDirDisplay.className = "flash-file-display";
    this.buildDirDisplay.textContent = "No build directory selected";
    buildRow.appendChild(this.buildDirDisplay);
    const buildBrowseBtn = document.createElement("button");
    buildBrowseBtn.className = "toolbar-btn";
    buildBrowseBtn.textContent = "Browse...";
    buildBrowseBtn.addEventListener("click", () => this.browseBuildDir());
    buildRow.appendChild(buildBrowseBtn);
    this.idfContent.appendChild(buildRow);

    // Segments table
    this.segmentsTable = document.createElement("div");
    this.segmentsTable.className = "flash-segments";
    this.idfContent.appendChild(this.segmentsTable);

    // App-only checkbox
    const optionRow = document.createElement("div");
    optionRow.className = "flash-row flash-option-row";
    this.appOnlyCheckbox = document.createElement("input");
    this.appOnlyCheckbox.type = "checkbox";
    this.appOnlyCheckbox.id = "flash-app-only";
    optionRow.appendChild(this.appOnlyCheckbox);
    const appOnlyLabel = document.createElement("label");
    appOnlyLabel.htmlFor = "flash-app-only";
    appOnlyLabel.className = "flash-checkbox-label";
    appOnlyLabel.textContent = "App only (faster, skip bootloader/partitions)";
    optionRow.appendChild(appOnlyLabel);
    this.idfContent.appendChild(optionRow);

    this.panel.appendChild(this.idfContent);

    // Flash button
    this.flashBtn = document.createElement("button");
    this.flashBtn.className = "flash-btn";
    this.flashBtn.textContent = "Flash Firmware";
    this.flashBtn.addEventListener("click", () => this.startFlash());
    this.panel.appendChild(this.flashBtn);

    // Progress
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

    // Status
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
    if (this.isFlashing) return;
    this.overlay.style.display = "none";
    this.onClose?.();
  }

  private setMode(mode: FlashMode): void {
    this.mode = mode;
    if (mode === "single") {
      this.singleTab.classList.add("flash-tab-active");
      this.idfTab.classList.remove("flash-tab-active");
      this.singleContent.style.display = "block";
      this.idfContent.style.display = "none";
    } else {
      this.idfTab.classList.add("flash-tab-active");
      this.singleTab.classList.remove("flash-tab-active");
      this.idfContent.style.display = "block";
      this.singleContent.style.display = "none";
    }
  }

  private reset(): void {
    this.selectedFilePath = null;
    this.selectedBuildDir = null;
    this.projectInfo = null;
    this.fileDisplay.textContent = "No file selected";
    this.buildDirDisplay.textContent = "No build directory selected";
    this.addrInput.value = "0x10000";
    this.segmentsTable.innerHTML = "";
    this.appOnlyCheckbox.checked = false;
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
    this.setMode(this.mode);
  }

  private async browseBinFile(): Promise<void> {
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
        const parts = selected.replace(/\\/g, "/").split("/");
        this.fileDisplay.textContent = parts[parts.length - 1];
        this.fileDisplay.title = selected;
      }
    } catch (e) {
      this.showStatus(`Browse failed: ${e}`, "error");
    }
  }

  private async browseBuildDir(): Promise<void> {
    if (this.isFlashing) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected) {
        this.selectedBuildDir = selected;
        const parts = selected.replace(/\\/g, "/").split("/");
        // Show last 2 path segments for context
        const display = parts.slice(-2).join("/");
        this.buildDirDisplay.textContent = display;
        this.buildDirDisplay.title = selected;
        await this.loadProjectInfo(selected);
      }
    } catch (e) {
      this.showStatus(`Browse failed: ${e}`, "error");
    }
  }

  private async loadProjectInfo(buildDir: string): Promise<void> {
    this.segmentsTable.innerHTML = "";
    this.showStatus("Reading project info...", "info");

    try {
      const info = await parseIdfProject(buildDir);
      this.projectInfo = info;

      // Header row
      const chipLine = document.createElement("div");
      chipLine.className = "flash-project-info";
      chipLine.textContent = `${info.chip} | ${info.flash_size} | ${info.flash_mode} @ ${info.flash_freq}`;
      this.segmentsTable.appendChild(chipLine);

      // Segment rows
      const table = document.createElement("div");
      table.className = "flash-segments-table";

      for (const seg of info.segments) {
        const row = document.createElement("div");
        row.className = "flash-segment-row";

        const name = document.createElement("span");
        name.className = "flash-seg-name";
        name.textContent = seg.name;
        row.appendChild(name);

        const offset = document.createElement("span");
        offset.className = "flash-seg-offset";
        offset.textContent = seg.offset;
        row.appendChild(offset);

        const size = document.createElement("span");
        size.className = "flash-seg-size";
        size.textContent = this.formatSize(seg.size);
        row.appendChild(size);

        table.appendChild(row);
      }

      this.segmentsTable.appendChild(table);
      this.showStatus(`Found ${info.segments.length} segments for ${info.app_name}`, "success");
    } catch (e) {
      this.projectInfo = null;
      this.showStatus(`${e}`, "error");
    }
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private async startFlash(): Promise<void> {
    if (this.mode === "single") {
      await this.startSingleFlash();
    } else {
      await this.startIdfFlash();
    }
  }

  private async startSingleFlash(): Promise<void> {
    if (!this.selectedFilePath) {
      this.showStatus("Please select a firmware file first", "error");
      return;
    }

    const addrStr = this.addrInput.value.trim();
    const flashAddr = parseInt(addrStr, addrStr.startsWith("0x") ? 16 : 10);
    if (isNaN(flashAddr) || flashAddr < 0) {
      this.showStatus("Invalid flash address", "error");
      return;
    }

    this.beginFlash();

    try {
      await flashFirmware(
        this.port,
        this.selectedFilePath,
        flashAddr,
        this.baudRate > 115200 ? this.baudRate : null,
        (progress: FlashProgress) => this.updateProgress(progress)
      );
      this.onFlashSuccess();
    } catch (e) {
      this.onFlashError(e);
    }
  }

  private async startIdfFlash(): Promise<void> {
    if (!this.selectedBuildDir || !this.projectInfo) {
      this.showStatus("Please select an ESP-IDF build directory first", "error");
      return;
    }

    this.beginFlash();

    try {
      await flashIdfProject(
        this.port,
        this.selectedBuildDir,
        this.appOnlyCheckbox.checked,
        this.baudRate > 115200 ? this.baudRate : null,
        (progress: FlashProgress) => this.updateProgress(progress)
      );
      this.onFlashSuccess();
    } catch (e) {
      this.onFlashError(e);
    }
  }

  private beginFlash(): void {
    this.isFlashing = true;
    this.flashBtn.disabled = true;
    this.flashBtn.textContent = "Flashing...";
    this.closeBtn.disabled = true;
    this.progressContainer.style.display = "block";
    this.progressFill.style.width = "0%";
    this.progressFill.className = "flash-progress-fill";
    this.progressLabel.textContent = "0%";
    this.showStatus("Connecting to bootloader...", "info");
  }

  private onFlashSuccess(): void {
    this.progressFill.style.width = "100%";
    this.progressFill.classList.add("flash-progress-success");
    this.progressLabel.textContent = "100%";
    this.showStatus("Flash complete! Reconnecting...", "success");
    this.flashBtn.textContent = "Done";
    this.closeBtn.disabled = false;
    this.isFlashing = false;
    setTimeout(() => {
      this.onFlashComplete?.();
    }, 2000);
  }

  private onFlashError(e: unknown): void {
    this.progressFill.classList.add("flash-progress-error");
    this.showStatus(`Flash failed: ${e}`, "error");
    this.flashBtn.disabled = false;
    this.flashBtn.textContent = "Retry";
    this.closeBtn.disabled = false;
    this.isFlashing = false;
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
