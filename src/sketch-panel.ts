import {
  compileSketch,
  detectArduinoCli,
  installArduinoCli,
  installEsp32Core,
  type ArduinoCliStatus,
  type CompileLog,
  type CompileResult,
  type InstallProgress,
} from "./sketch-api";

interface FqbnOption {
  fqbn: string;
  label: string;
}

const FQBN_OPTIONS: FqbnOption[] = [
  { fqbn: "esp32:esp32:esp32doit-devkit-v1", label: "ESP32 DevKit V1 (30-pin)" },
  { fqbn: "esp32:esp32:esp32", label: "ESP32 Dev Module (DevKitC, 38-pin)" },
  { fqbn: "esp32:esp32:esp32s3", label: "ESP32-S3 Dev Module" },
  { fqbn: "esp32:esp32:esp32s3usbotg", label: "ESP32-S3-USB-OTG" },
  { fqbn: "esp32:esp32:esp32s3box", label: "ESP32-S3-BOX" },
];

const DEFAULT_SKETCH = `void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  delay(500);
}
`;

export class SketchPanel {
  readonly overlay: HTMLElement;

  private panel: HTMLElement;
  private closeBtn: HTMLButtonElement;
  private statusStrip: HTMLElement;
  private fqbnSelect: HTMLSelectElement;
  private editor: HTMLTextAreaElement;
  private logPane: HTMLElement;
  private compileBtn: HTMLButtonElement;
  private compileAndFlashBtn: HTMLButtonElement;
  private statusLine: HTMLElement;

  private port = "";
  private cliStatus: ArduinoCliStatus | null = null;
  private isCompiling = false;
  private isInstalling = false;

  onClose: (() => void) | null = null;
  onCompileAndFlash:
    | ((result: CompileResult, fqbn: string) => Promise<void> | void)
    | null = null;

  constructor() {
    this.overlay = document.createElement("div");
    this.overlay.className = "sketch-overlay";
    this.overlay.style.display = "none";

    this.panel = document.createElement("div");
    this.panel.className = "sketch-panel";

    // Header
    const header = document.createElement("div");
    header.className = "sketch-header";
    const title = document.createElement("span");
    title.className = "sketch-title";
    title.textContent = "Sketch Editor";
    header.appendChild(title);
    this.closeBtn = document.createElement("button");
    this.closeBtn.className = "sketch-close-btn";
    this.closeBtn.textContent = "×";
    this.closeBtn.addEventListener("click", () => this.hide());
    header.appendChild(this.closeBtn);
    this.panel.appendChild(header);

    // Status strip (arduino-cli + core)
    this.statusStrip = document.createElement("div");
    this.statusStrip.className = "sketch-status-strip";
    this.statusStrip.textContent = "Detecting arduino-cli...";
    this.panel.appendChild(this.statusStrip);

    // FQBN row
    const fqbnRow = document.createElement("div");
    fqbnRow.className = "sketch-row";
    const fqbnLabel = document.createElement("label");
    fqbnLabel.textContent = "Board:";
    fqbnLabel.className = "sketch-label";
    fqbnRow.appendChild(fqbnLabel);
    this.fqbnSelect = document.createElement("select");
    this.fqbnSelect.className = "sketch-fqbn-select";
    for (const opt of FQBN_OPTIONS) {
      const o = document.createElement("option");
      o.value = opt.fqbn;
      o.textContent = `${opt.label} — ${opt.fqbn}`;
      this.fqbnSelect.appendChild(o);
    }
    fqbnRow.appendChild(this.fqbnSelect);
    this.panel.appendChild(fqbnRow);

    // Editor
    this.editor = document.createElement("textarea");
    this.editor.className = "sketch-editor";
    this.editor.spellcheck = false;
    this.editor.autocapitalize = "off";
    this.editor.autocomplete = "off";
    this.editor.addEventListener("keydown", (e) => this.onEditorKeydown(e));
    this.editor.addEventListener("input", () => this.saveDraft());
    this.panel.appendChild(this.editor);

    // Log pane
    this.logPane = document.createElement("div");
    this.logPane.className = "sketch-log";
    this.panel.appendChild(this.logPane);

    // Footer
    const footer = document.createElement("div");
    footer.className = "sketch-footer";
    this.statusLine = document.createElement("span");
    this.statusLine.className = "sketch-status-line";
    footer.appendChild(this.statusLine);

    const btnGroup = document.createElement("div");
    btnGroup.className = "sketch-btn-group";

    this.compileBtn = document.createElement("button");
    this.compileBtn.className = "sketch-btn";
    this.compileBtn.textContent = "Compile";
    this.compileBtn.addEventListener("click", () => this.runCompile(false));
    btnGroup.appendChild(this.compileBtn);

    this.compileAndFlashBtn = document.createElement("button");
    this.compileAndFlashBtn.className = "sketch-btn sketch-btn-primary";
    this.compileAndFlashBtn.textContent = "Compile & Flash";
    this.compileAndFlashBtn.addEventListener("click", () => this.runCompile(true));
    btnGroup.appendChild(this.compileAndFlashBtn);

    footer.appendChild(btnGroup);
    this.panel.appendChild(footer);

    this.overlay.appendChild(this.panel);
  }

  show(port: string): void {
    this.port = port;
    this.overlay.style.display = "flex";
    this.loadDraft();
    this.detectCli();
    setTimeout(() => this.editor.focus(), 0);
  }

  hide(): void {
    if (this.isCompiling) return;
    this.overlay.style.display = "none";
    this.onClose?.();
  }

  private async detectCli(): Promise<void> {
    this.statusStrip.textContent = "Detecting arduino-cli...";
    this.statusStrip.className = "sketch-status-strip";
    try {
      const status = await detectArduinoCli();
      this.cliStatus = status;
      this.renderStatusStrip(status);
      this.updateButtons();
    } catch (e) {
      this.cliStatus = null;
      this.statusStrip.className = "sketch-status-strip sketch-status-error";
      this.statusStrip.textContent = `Detection failed: ${e}`;
      this.updateButtons();
    }
  }

  private renderStatusStrip(status: ArduinoCliStatus): void {
    this.statusStrip.innerHTML = "";
    if (!status.available) {
      this.statusStrip.className = "sketch-status-strip sketch-status-error";
      const row = document.createElement("div");
      row.className = "sketch-status-row";
      const msg = document.createElement("span");
      msg.textContent = "arduino-cli not found.";
      row.appendChild(msg);
      const installBtn = document.createElement("button");
      installBtn.className = "sketch-btn sketch-btn-primary";
      installBtn.textContent = "Install for me";
      installBtn.addEventListener("click", () => this.runInstallArduinoCli());
      installBtn.disabled = this.isInstalling || this.isCompiling;
      row.appendChild(installBtn);
      this.statusStrip.appendChild(row);
      const hint = document.createElement("div");
      hint.className = "sketch-status-hint";
      hint.textContent =
        "Downloads ~30 MB to the app's data folder. No admin rights or PATH changes needed.";
      this.statusStrip.appendChild(hint);
      return;
    }

    if (!status.esp32_core_installed) {
      this.statusStrip.className = "sketch-status-strip sketch-status-warn";
      const row = document.createElement("div");
      row.className = "sketch-status-row";
      const msg = document.createElement("span");
      msg.textContent = `arduino-cli ${status.version ?? ""} OK, but ESP32 core is missing.`;
      row.appendChild(msg);
      const installBtn = document.createElement("button");
      installBtn.className = "sketch-btn sketch-btn-primary";
      installBtn.textContent = "Install ESP32 core";
      installBtn.addEventListener("click", () => this.runInstallEsp32Core());
      installBtn.disabled = this.isInstalling || this.isCompiling;
      row.appendChild(installBtn);
      this.statusStrip.appendChild(row);
      const hint = document.createElement("div");
      hint.className = "sketch-status-hint";
      hint.textContent =
        "Downloads ~400 MB the first time. Runs `arduino-cli core update-index` then `core install esp32:esp32`.";
      this.statusStrip.appendChild(hint);
      return;
    }

    this.statusStrip.className = "sketch-status-strip sketch-status-ok";
    this.statusStrip.textContent = `arduino-cli ${status.version ?? "?"}  ·  esp32:esp32 ${
      status.esp32_core_version ?? "?"
    }`;
  }

  private async runInstallEsp32Core(): Promise<void> {
    if (this.isInstalling) return;
    this.isInstalling = true;
    this.updateButtons();
    this.clearLog();
    this.setStatus("Installing ESP32 core (this takes a few minutes)...", "info");
    try {
      await installEsp32Core((entry) => this.appendLog(entry));
      this.setStatus("ESP32 core installed", "ok");
    } catch (e) {
      this.appendLog({ stream: "stderr", line: String(e) });
      this.setStatus("Install failed", "error");
    } finally {
      this.isInstalling = false;
      await this.detectCli();
    }
  }

  private async runInstallArduinoCli(): Promise<void> {
    if (this.isInstalling) return;
    this.isInstalling = true;
    this.updateButtons();
    this.clearLog();
    this.setStatus("Installing arduino-cli...", "info");
    try {
      const result = await installArduinoCli((p) => this.onInstallProgress(p));
      if (!result.ok) {
        this.setStatus(`Install failed: ${result.error ?? "unknown error"}`, "error");
      } else {
        this.setStatus("arduino-cli installed", "ok");
      }
    } catch (e) {
      this.appendLog({ stream: "stderr", line: String(e) });
      this.setStatus("Install failed", "error");
    } finally {
      this.isInstalling = false;
      await this.detectCli();
    }
  }

  private onInstallProgress(p: InstallProgress): void {
    switch (p.stage) {
      case "starting":
        this.appendLog({ stream: "stdout", line: `Downloading ${p.asset}` });
        this.appendLog({ stream: "stdout", line: `  ${p.url}` });
        break;
      case "downloading": {
        const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
        const pct = p.total > 0 ? Math.floor((p.current / p.total) * 100) : -1;
        const line =
          p.total > 0
            ? `  ${mb(p.current)} / ${mb(p.total)} MB (${pct}%)`
            : `  ${mb(p.current)} MB`;
        this.replaceOrAppendProgress(line);
        break;
      }
      case "extracting":
        this.appendLog({ stream: "stdout", line: "Extracting..." });
        break;
      case "verifying":
        this.appendLog({ stream: "stdout", line: "Verifying..." });
        break;
      case "done":
        this.appendLog({
          stream: "stdout",
          line: `Installed${p.version ? ` ${p.version}` : ""} at ${p.path}`,
        });
        break;
      case "error":
        this.appendLog({ stream: "stderr", line: p.message });
        break;
    }
  }

  private replaceOrAppendProgress(line: string): void {
    const last = this.logPane.lastElementChild;
    if (last && last.classList.contains("sketch-log-progress")) {
      last.textContent = line;
    } else {
      const div = document.createElement("div");
      div.className = "sketch-log-line sketch-log-stdout sketch-log-progress";
      div.textContent = line;
      this.logPane.appendChild(div);
    }
    this.logPane.scrollTop = this.logPane.scrollHeight;
  }

  private updateButtons(): void {
    const ready =
      !!this.cliStatus?.available &&
      this.cliStatus?.esp32_core_installed &&
      !this.isCompiling &&
      !this.isInstalling;
    this.compileBtn.disabled = !ready;
    this.compileAndFlashBtn.disabled = !ready;
  }

  private async runCompile(thenFlash: boolean): Promise<void> {
    if (this.isCompiling) return;
    const source = this.editor.value;
    if (source.trim().length === 0) {
      this.setStatus("Sketch is empty", "error");
      return;
    }

    this.isCompiling = true;
    this.clearLog();
    this.updateButtons();
    this.setStatus("Compiling...", "info");

    let result: CompileResult | null = null;
    try {
      result = await compileSketch(source, this.fqbnSelect.value, (entry) =>
        this.appendLog(entry)
      );
    } catch (e) {
      this.appendLog({ stream: "stderr", line: String(e) });
      this.setStatus("Compile failed", "error");
      this.isCompiling = false;
      this.updateButtons();
      return;
    }

    if (!result.ok) {
      this.setStatus(
        `Compile failed (exit ${result.exit_code ?? "?"})`,
        "error"
      );
      this.isCompiling = false;
      this.updateButtons();
      return;
    }

    this.setStatus("Compile OK", "ok");

    if (thenFlash) {
      if (!this.onCompileAndFlash) {
        this.appendLog({
          stream: "stderr",
          line: "Flash handler not wired yet — binary is at " + result.binary_path,
        });
      } else {
        this.setStatus("Flashing...", "info");
        try {
          await this.onCompileAndFlash(result, this.fqbnSelect.value);
          this.setStatus("Flash complete", "ok");
        } catch (e) {
          this.appendLog({ stream: "stderr", line: `Flash error: ${e}` });
          this.setStatus("Flash failed", "error");
        }
      }
    }

    this.isCompiling = false;
    this.updateButtons();
  }

  appendLog(entry: CompileLog): void {
    const line = document.createElement("div");
    line.className = `sketch-log-line sketch-log-${entry.stream}`;
    line.textContent = entry.line;
    this.logPane.appendChild(line);
    // Cap DOM nodes so a long --verbose compile cannot blow up memory.
    const MAX = 2000;
    while (this.logPane.childNodes.length > MAX) {
      this.logPane.removeChild(this.logPane.firstChild!);
    }
    this.logPane.scrollTop = this.logPane.scrollHeight;
  }

  private clearLog(): void {
    this.logPane.textContent = "";
  }

  private setStatus(text: string, level: "info" | "ok" | "error"): void {
    this.statusLine.textContent = text;
    this.statusLine.className = `sketch-status-line sketch-status-line-${level}`;
  }

  private onEditorKeydown(e: KeyboardEvent): void {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = this.editor.selectionStart;
      const end = this.editor.selectionEnd;
      const value = this.editor.value;
      this.editor.value = value.slice(0, start) + "  " + value.slice(end);
      this.editor.selectionStart = this.editor.selectionEnd = start + 2;
      this.saveDraft();
    }
  }

  private draftKey(): string {
    return `sm_sketch_${this.port || "default"}`;
  }

  private saveDraft(): void {
    try {
      localStorage.setItem(this.draftKey(), this.editor.value);
    } catch (_) {
      // ignore quota errors
    }
  }

  private loadDraft(): void {
    let value: string | null = null;
    try {
      value = localStorage.getItem(this.draftKey());
    } catch (_) {
      // ignore
    }
    this.editor.value = value ?? DEFAULT_SKETCH;
  }
}
