import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Terminal } from "./terminal";
import { CommandInput } from "./command-input";
import { FilterInput } from "./filter";
import { connectPort, disconnectPort, sendToPort, startLog, stopLog } from "./serial-api";
import type { SerialData, SerialStatus } from "./types";

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

export class Connection {
  readonly port: string;
  readonly baudRate: number;
  readonly panel: HTMLElement;
  readonly terminal: Terminal;
  readonly commandInput: CommandInput;
  readonly filterInput: FilterInput;

  private terminalContainer: HTMLElement;
  private statusIndicator: HTMLElement;
  private autoScrollBtn: HTMLButtonElement;
  private timestampsBtn: HTMLButtonElement;
  private logBtn: HTMLButtonElement;
  private clearBtn: HTMLButtonElement;

  private _status: ConnectionStatus = "disconnected";
  private reconnectEnabled = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 30;
  private unlistenStatus: UnlistenFn | null = null;
  private isLogging = false;

  onStatusChange: ((status: ConnectionStatus) => void) | null = null;

  constructor(port: string, baudRate: number) {
    this.port = port;
    this.baudRate = baudRate;

    // Build the panel DOM
    this.panel = document.createElement("div");
    this.panel.className = "connection-panel";

    // Toolbar
    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    this.filterInput = new FilterInput(toolbar, (text) => {
      this.terminal.filterText = text;
    });

    this.timestampsBtn = this.createToolbarButton("Timestamps", () => {
      this.terminal.showTimestamps = !this.terminal.showTimestamps;
      this.timestampsBtn.classList.toggle("active", this.terminal.showTimestamps);
    });
    toolbar.appendChild(this.timestampsBtn);

    this.logBtn = this.createToolbarButton("Log", () => this.toggleLog());
    toolbar.appendChild(this.logBtn);

    this.panel.appendChild(toolbar);

    // Terminal
    this.terminalContainer = document.createElement("div");
    this.terminalContainer.className = "terminal-output";
    this.panel.appendChild(this.terminalContainer);
    this.terminal = new Terminal(this.terminalContainer);

    // Bottom bar
    const bottomBar = document.createElement("div");
    bottomBar.className = "bottom-bar";

    // Command input
    const cmdArea = document.createElement("div");
    cmdArea.className = "command-area";
    this.commandInput = new CommandInput(cmdArea, (text, lineEnding) => {
      sendToPort(this.port, text, lineEnding).catch((e) =>
        this.showToast(`Send failed: ${e}`, "error")
      );
    });
    bottomBar.appendChild(cmdArea);

    // Bottom controls
    const controls = document.createElement("div");
    controls.className = "bottom-controls";

    this.autoScrollBtn = this.createToolbarButton("Auto-scroll", () => {
      this.terminal.autoScrollEnabled = !this.terminal.autoScrollEnabled;
      this.autoScrollBtn.classList.toggle("active", this.terminal.autoScrollEnabled);
    });
    this.autoScrollBtn.classList.add("active");
    controls.appendChild(this.autoScrollBtn);

    this.clearBtn = this.createToolbarButton("Clear", () => {
      this.terminal.clear();
    });
    controls.appendChild(this.clearBtn);

    this.statusIndicator = document.createElement("span");
    this.statusIndicator.className = "status-indicator";
    controls.appendChild(this.statusIndicator);

    bottomBar.appendChild(controls);
    this.panel.appendChild(bottomBar);
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  async connect(): Promise<void> {
    try {
      await connectPort(this.port, this.baudRate, (data: SerialData) => {
        this.terminal.appendData(data.data);
        this.forwardToLog(data.data);
      });
      this._status = "connected";
      this.reconnectAttempts = 0;
      this.updateStatusUI();
      this.onStatusChange?.("connected");
      this.listenForDisconnect();
    } catch (e) {
      this._status = "disconnected";
      this.updateStatusUI();
      throw e;
    }
  }

  async disconnect(): Promise<void> {
    this.reconnectEnabled = false;
    this.clearReconnectTimer();
    if (this.unlistenStatus) {
      this.unlistenStatus();
      this.unlistenStatus = null;
    }
    try {
      await disconnectPort(this.port);
    } catch (_) {
      // Ignore errors on disconnect (may already be disconnected)
    }
    if (this.isLogging) {
      try {
        await stopLog(this.port);
      } catch (_) {
        // ignore
      }
      this.isLogging = false;
      this.logBtn.classList.remove("active");
    }
    this._status = "disconnected";
    this.updateStatusUI();
    this.onStatusChange?.("disconnected");
  }

  show(): void {
    this.panel.style.display = "flex";
    this.commandInput.focus();
  }

  hide(): void {
    this.panel.style.display = "none";
  }

  private async listenForDisconnect(): Promise<void> {
    // Clean up previous listener to prevent accumulation
    if (this.unlistenStatus) {
      this.unlistenStatus();
      this.unlistenStatus = null;
    }
    this.unlistenStatus = await listen<SerialStatus>("serial-status", (event) => {
      if (event.payload.port === this.port && event.payload.status === "disconnected") {
        this._status = "disconnected";
        this.updateStatusUI();
        this.onStatusChange?.("disconnected");
        if (this.reconnectEnabled) {
          this.startReconnect();
        }
      }
    });
  }

  private startReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this._status = "disconnected";
      this.updateStatusUI();
      this.showToast(`Failed to reconnect to ${this.port} after ${this.maxReconnectAttempts} attempts`, "error");
      return;
    }

    this._status = "reconnecting";
    this.updateStatusUI();
    this.onStatusChange?.("reconnecting");

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectAttempts++;
      try {
        await connectPort(this.port, this.baudRate, (data: SerialData) => {
          this.terminal.appendData(data.data);
          this.forwardToLog(data.data);
        });
        this._status = "connected";
        this.reconnectAttempts = 0;
        this.updateStatusUI();
        this.onStatusChange?.("connected");
        this.listenForDisconnect();
      } catch (_) {
        this.startReconnect();
      }
    }, 1000);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private updateStatusUI(): void {
    this.statusIndicator.textContent = this._status;
    this.statusIndicator.className = `status-indicator status-${this._status}`;
  }

  private async toggleLog(): Promise<void> {
    if (this.isLogging) {
      try {
        await stopLog(this.port);
      } catch (e) {
        this.showToast(`Stop log failed: ${e}`, "error");
      }
      this.isLogging = false;
      this.logBtn.classList.remove("active");
    } else {
      const now = new Date();
      const dateStr = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, "0")}${now.getDate().toString().padStart(2, "0")}_${now.getHours().toString().padStart(2, "0")}${now.getMinutes().toString().padStart(2, "0")}${now.getSeconds().toString().padStart(2, "0")}`;
      const safeName = this.port.replace(/[/\\:]/g, "_");
      const fileName = `SerialLog_${safeName}_${dateStr}.txt`;

      // Use dialog to let user pick save location
      try {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const filePath = await save({
          defaultPath: fileName,
          filters: [{ name: "Text Files", extensions: ["txt", "log"] }],
        });
        if (!filePath) return;

        await startLog(this.port, filePath);
        this.isLogging = true;
        this.logBtn.classList.add("active");
      } catch (e) {
        this.showToast(`Start log failed: ${e}`, "error");
      }
    }
  }

  private forwardToLog(_data: string): void {
    if (!this.isLogging) return;
    // Logging data is forwarded by the Rust read loop via log_tx when active.
    // Frontend just needs to call startLog/stopLog to enable/disable it.
  }

  private createToolbarButton(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = "toolbar-btn";
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }

  private showToast(message: string, type: "info" | "error" = "info"): void {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("toast-fade");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}
