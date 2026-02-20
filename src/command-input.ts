export class CommandInput {
  private history: string[] = [];
  private historyIndex = -1;
  private input: HTMLInputElement;
  private onSend: (text: string, lineEnding: string) => void;
  private lineEndingSelect: HTMLSelectElement;

  constructor(
    container: HTMLElement,
    onSend: (text: string, lineEnding: string) => void
  ) {
    this.onSend = onSend;

    const wrapper = document.createElement("div");
    wrapper.className = "command-input-wrapper";

    const prompt = document.createElement("span");
    prompt.className = "command-prompt";
    prompt.textContent = ">";

    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.className = "command-input";
    this.input.placeholder = "Send command...";
    this.input.spellcheck = false;

    this.lineEndingSelect = document.createElement("select");
    this.lineEndingSelect.className = "line-ending-select";
    const endings = [
      { value: "lf", label: "\\n (LF)" },
      { value: "crlf", label: "\\r\\n (CRLF)" },
      { value: "cr", label: "\\r (CR)" },
      { value: "none", label: "None" },
    ];
    for (const e of endings) {
      const opt = document.createElement("option");
      opt.value = e.value;
      opt.textContent = e.label;
      this.lineEndingSelect.appendChild(opt);
    }

    wrapper.appendChild(prompt);
    wrapper.appendChild(this.input);
    wrapper.appendChild(this.lineEndingSelect);
    container.appendChild(wrapper);

    this.input.addEventListener("keydown", (e) => this.handleKeydown(e));
  }

  focus(): void {
    this.input.focus();
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (e.key === "Enter") {
      const text = this.input.value;
      if (text.length === 0) return;
      this.history.push(text);
      this.historyIndex = this.history.length;
      this.input.value = "";
      this.onSend(text, this.lineEndingSelect.value);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (this.historyIndex > 0) {
        this.historyIndex--;
        this.input.value = this.history[this.historyIndex];
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (this.historyIndex < this.history.length - 1) {
        this.historyIndex++;
        this.input.value = this.history[this.historyIndex];
      } else {
        this.historyIndex = this.history.length;
        this.input.value = "";
      }
    }
  }
}
