import type { LineEntry } from "./types";

const MAX_LINES = 10_000;

export class Terminal {
  private lines: LineEntry[] = [];
  private partialLine = "";
  private container: HTMLElement;
  private autoScroll = true;
  private _showTimestamps = false;
  private _filterText = "";

  constructor(container: HTMLElement) {
    this.container = container;
  }

  get showTimestamps(): boolean {
    return this._showTimestamps;
  }

  set showTimestamps(value: boolean) {
    this._showTimestamps = value;
    this.refresh();
  }

  get filterText(): string {
    return this._filterText;
  }

  set filterText(value: string) {
    this._filterText = value.toLowerCase();
    this.refresh();
  }

  get autoScrollEnabled(): boolean {
    return this.autoScroll;
  }

  set autoScrollEnabled(value: boolean) {
    this.autoScroll = value;
  }

  appendData(raw: string): void {
    const text = this.partialLine + raw;
    const parts = text.split("\n");

    // Last element is the new partial line (empty string if text ended with \n)
    this.partialLine = parts.pop()!;

    const now = Date.now();
    for (const part of parts) {
      const cleaned = part.replace(/\r$/, "");
      this.lines.push({ text: cleaned, timestamp: now });
    }

    // Trim to MAX_LINES
    if (this.lines.length > MAX_LINES) {
      this.lines = this.lines.slice(this.lines.length - MAX_LINES);
    }

    this.renderNewLines(parts.length);
  }

  clear(): void {
    this.lines = [];
    this.partialLine = "";
    this.container.textContent = "";
  }

  refresh(): void {
    this.container.textContent = "";
    const filtered = this.getFilteredLines();
    const fragment = document.createDocumentFragment();
    for (const line of filtered) {
      fragment.appendChild(this.createLineElement(line));
    }
    this.container.appendChild(fragment);
    this.scrollToBottom();
  }

  getLineCount(): number {
    return this.lines.length;
  }

  getAllText(): string {
    return this.lines.map((l) => l.text).join("\n");
  }

  private getFilteredLines(): LineEntry[] {
    if (!this._filterText) return this.lines;
    return this.lines.filter((l) =>
      l.text.toLowerCase().includes(this._filterText)
    );
  }

  private renderNewLines(count: number): void {
    if (count === 0) return;

    const newLines = this.lines.slice(-count);
    const fragment = document.createDocumentFragment();

    for (const line of newLines) {
      if (
        this._filterText &&
        !line.text.toLowerCase().includes(this._filterText)
      ) {
        continue;
      }
      fragment.appendChild(this.createLineElement(line));
    }

    this.container.appendChild(fragment);

    // Trim DOM nodes to prevent memory bloat
    while (this.container.childNodes.length > MAX_LINES) {
      this.container.removeChild(this.container.firstChild!);
    }

    this.scrollToBottom();
  }

  private createLineElement(line: LineEntry): HTMLElement {
    const div = document.createElement("div");
    div.className = "terminal-line";

    if (this._showTimestamps) {
      const ts = this.formatTimestamp(line.timestamp);
      const span = document.createElement("span");
      span.className = "timestamp";
      span.textContent = `[${ts}] `;
      div.appendChild(span);
    }

    div.appendChild(document.createTextNode(line.text));
    return div;
  }

  private formatTimestamp(ms: number): string {
    const d = new Date(ms);
    const h = d.getHours().toString().padStart(2, "0");
    const m = d.getMinutes().toString().padStart(2, "0");
    const s = d.getSeconds().toString().padStart(2, "0");
    const millis = d.getMilliseconds().toString().padStart(3, "0");
    return `${h}:${m}:${s}.${millis}`;
  }

  private scrollToBottom(): void {
    if (this.autoScroll) {
      this.container.scrollTop = this.container.scrollHeight;
    }
  }
}
