import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Terminal } from "./terminal";
import { CommandInput } from "./command-input";
import { FilterInput } from "./filter";
import { FlashPanel } from "./flash-panel";
import { SketchPanel } from "./sketch-panel";
import { connectPort, disconnectPort, sendToPort, startLog, stopLog } from "./serial-api";
import { uploadSketch } from "./sketch-api";
import type { SerialData, SerialStatus } from "./types";
import { PinStore } from "./pin-monitor/store";
import { PinInterceptor } from "./pin-monitor/interceptor";
import { BoardView } from "./pin-monitor/board-view";
import {
  BOARDS,
  DEFAULT_BOARD,
  findBoard,
  findBoardByAlias,
  guessBoardByPortName,
  type BoardLayout,
} from "./pin-monitor/boards";

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
  private flashBtn: HTMLButtonElement;
  private pinsBtn: HTMLButtonElement;
  private sketchBtn: HTMLButtonElement;
  private sketchPanel: SketchPanel;
  private flashPanel: FlashPanel;
  private clearBtn: HTMLButtonElement;

  private pinStore: PinStore;
  private pinInterceptor: PinInterceptor;
  private pinsPanel: HTMLElement;
  private boardContainer!: HTMLElement;
  private boardSelect!: HTMLSelectElement;
  private boardView: BoardView | null = null;
  private activeBoard: BoardLayout = DEFAULT_BOARD;
  private userPickedBoard = false;
  private showProtocolCheckbox: HTMLInputElement;
  private pinsOpen = false;

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

    this.flashBtn = this.createToolbarButton("Flash", () => this.openFlashPanel());
    toolbar.appendChild(this.flashBtn);

    this.sketchBtn = this.createToolbarButton("Sketch", () => this.openSketchPanel());
    toolbar.appendChild(this.sketchBtn);

    this.pinsBtn = this.createToolbarButton("Pins", () => this.togglePins());
    toolbar.appendChild(this.pinsBtn);

    this.panel.appendChild(toolbar);

    // Flash panel overlay (appended to connection panel)
    this.flashPanel = new FlashPanel();
    this.flashPanel.onFlashComplete = () => this.onFlashDone();
    this.flashPanel.onClose = () => this.onFlashPanelClosed();
    this.panel.appendChild(this.flashPanel.overlay);

    // Sketch editor overlay
    this.sketchPanel = new SketchPanel();
    this.sketchPanel.onClose = () => this.onSketchPanelClosed();
    this.sketchPanel.onCompileAndFlash = (result, fqbn) => this.flashCompiledSketch(result, fqbn);
    this.panel.appendChild(this.sketchPanel.overlay);

    // Main area: terminal on left, pins panel on right (when toggled)
    const mainArea = document.createElement("div");
    mainArea.className = "connection-main";

    this.terminalContainer = document.createElement("div");
    this.terminalContainer.className = "terminal-output";
    mainArea.appendChild(this.terminalContainer);
    this.terminal = new Terminal(this.terminalContainer);

    // Pin monitor wiring
    this.pinStore = new PinStore();
    this.pinInterceptor = new PinInterceptor(this.pinStore);

    this.pinsPanel = document.createElement("div");
    this.pinsPanel.className = "pins-panel";
    this.pinsPanel.style.display = "none";

    const pinsHeader = document.createElement("div");
    pinsHeader.className = "pins-header";

    this.activeBoard = guessBoardByPortName(port) ?? DEFAULT_BOARD;
    this.boardSelect = document.createElement("select");
    this.boardSelect.className = "pins-board-select";
    for (const b of BOARDS) {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = b.name;
      this.boardSelect.appendChild(opt);
    }
    this.boardSelect.value = this.activeBoard.id;
    this.boardSelect.addEventListener("change", () => {
      const next = findBoard(this.boardSelect.value);
      if (next) {
        this.userPickedBoard = true;
        this.setActiveBoard(next);
      }
    });
    pinsHeader.appendChild(this.boardSelect);

    const protocolLabel = document.createElement("label");
    protocolLabel.className = "pins-protocol-toggle";
    this.showProtocolCheckbox = document.createElement("input");
    this.showProtocolCheckbox.type = "checkbox";
    this.showProtocolCheckbox.addEventListener("change", () => {
      this.pinInterceptor.showProtocol = this.showProtocolCheckbox.checked;
    });
    protocolLabel.appendChild(this.showProtocolCheckbox);
    protocolLabel.appendChild(document.createTextNode(" Show pin protocol"));
    pinsHeader.appendChild(protocolLabel);

    this.pinsPanel.appendChild(pinsHeader);

    const boardContainer = document.createElement("div");
    boardContainer.className = "pins-board-container";
    this.pinsPanel.appendChild(boardContainer);
    this.boardContainer = boardContainer;

    this.pinsPanel.appendChild(this.createLegend());

    mainArea.appendChild(this.pinsPanel);
    this.panel.appendChild(mainArea);

    // Auto-switch board when firmware sends a recognised $HELLO.
    this.pinStore.subscribeBoard((boardId) => {
      if (this.userPickedBoard || !boardId) return;
      const match = findBoardByAlias(boardId);
      if (match && match.id !== this.activeBoard.id) {
        this.setActiveBoard(match);
      }
    });

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

    const baudLabel = document.createElement("span");
    baudLabel.className = "baud-rate-label";
    baudLabel.textContent = `${this.baudRate} baud`;
    controls.appendChild(baudLabel);

    this.statusIndicator = document.createElement("span");
    this.statusIndicator.className = "status-indicator";
    controls.appendChild(this.statusIndicator);

    bottomBar.appendChild(controls);
    this.panel.appendChild(bottomBar);
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  private handleIncomingData = (data: SerialData): void => {
    const forTerminal = this.pinInterceptor.process(data.data);
    if (forTerminal.length > 0) this.terminal.appendData(forTerminal);
    this.forwardToLog(data.data);
  };

  private togglePins(): void {
    this.pinsOpen = !this.pinsOpen;
    this.pinsBtn.classList.toggle("active", this.pinsOpen);
    this.pinsPanel.style.display = this.pinsOpen ? "flex" : "none";
    if (this.pinsOpen && !this.boardView) {
      this.boardView = new BoardView(this.boardContainer, this.pinStore, this.activeBoard);
    }
  }

  private setActiveBoard(board: BoardLayout): void {
    if (board.id === this.activeBoard.id) return;
    this.activeBoard = board;
    if (this.boardSelect.value !== board.id) {
      this.boardSelect.value = board.id;
    }
    this.boardView?.setBoard(board);
  }

  async connect(): Promise<void> {
    try {
      await connectPort(this.port, this.baudRate, this.handleIncomingData);
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
        await connectPort(this.port, this.baudRate, this.handleIncomingData);
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
        const { documentDir } = await import("@tauri-apps/api/path");
        const { save } = await import("@tauri-apps/plugin-dialog");
        let defaultPath = fileName;
        try {
          const docsDir = await documentDir();
          defaultPath = `${docsDir}/${fileName}`;
        } catch (_) {
          // Fall back to just the filename if Documents is unavailable
        }
        const filePath = await save({
          defaultPath,
          filters: [{ name: "Text Files", extensions: ["txt", "log"] }],
        });
        if (!filePath) return;

        await startLog(this.port, filePath, this.terminal.showTimestamps);
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

  private openFlashPanel(): void {
    // Pause auto-reconnect during flash
    this.reconnectEnabled = false;
    this.clearReconnectTimer();
    this.flashPanel.show(this.port, this.baudRate);
  }

  private openSketchPanel(): void {
    // Pause auto-reconnect — a compile-and-flash cycle will tear down the port.
    this.reconnectEnabled = false;
    this.clearReconnectTimer();
    this.sketchPanel.show(this.port);
  }

  private async onFlashDone(): Promise<void> {
    this.terminal.appendData("\r\n[Flash complete — reconnecting...]\r\n");
    this.flashPanel.hide();
    await this.reconnectAfterFlash();
  }

  private onFlashPanelClosed(): void {
    // Re-enable auto-reconnect when panel is closed without flashing
    this.reconnectEnabled = true;
    // If we're disconnected (flash happened but user closed before reconnect), try reconnecting
    if (this._status === "disconnected" || this._status === "reconnecting") {
      this.startReconnect();
    }
  }

  private onSketchPanelClosed(): void {
    this.reconnectEnabled = true;
    if (this._status === "disconnected" || this._status === "reconnecting") {
      this.startReconnect();
    }
  }

  private async reconnectAfterFlash(): Promise<void> {
    this.reconnectEnabled = true;
    try {
      await connectPort(this.port, this.baudRate, this.handleIncomingData);
      this._status = "connected";
      this.reconnectAttempts = 0;
      this.updateStatusUI();
      this.onStatusChange?.("connected");
      this.listenForDisconnect();
    } catch (_) {
      this._status = "disconnected";
      this.updateStatusUI();
      this.onStatusChange?.("disconnected");
      this.showToast("Flash succeeded but reconnect failed. Try reconnecting manually.", "error");
    }
  }

  private async flashCompiledSketch(
    result: { sketch_dir: string | null },
    fqbn: string
  ): Promise<void> {
    if (!result.sketch_dir) {
      throw new Error("No sketch dir from compile");
    }
    this.sketchPanel.appendLog({ stream: "stdout", line: "Uploading..." });
    await uploadSketch(this.port, fqbn, result.sketch_dir, (entry) =>
      this.sketchPanel.appendLog(entry)
    );
    this.sketchPanel.appendLog({
      stream: "stdout",
      line: "Upload complete — reconnecting...",
    });
    await this.reconnectAfterFlash();
  }

  private createLegend(): HTMLElement {
    const legend = document.createElement("div");
    legend.className = "pins-legend";
    const items: Array<[string, string]> = [
      ["HIGH", "legend-high"],
      ["LOW", "legend-low"],
      ["unknown", "legend-unknown"],
      ["power", "legend-power"],
      ["GND", "legend-ground"],
      ["RST", "legend-reset"],
    ];
    for (const [label, cls] of items) {
      const item = document.createElement("span");
      item.className = "pins-legend-item";
      const swatch = document.createElement("span");
      swatch.className = `pins-legend-swatch ${cls}`;
      item.appendChild(swatch);
      item.appendChild(document.createTextNode(label));
      legend.appendChild(item);
    }
    return legend;
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
