export class FilterInput {
  private input: HTMLInputElement;
  private onChange: (text: string) => void;

  constructor(container: HTMLElement, onChange: (text: string) => void) {
    this.onChange = onChange;

    const wrapper = document.createElement("div");
    wrapper.className = "filter-wrapper";

    const label = document.createElement("span");
    label.className = "filter-label";
    label.textContent = "Filter:";

    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.className = "filter-input";
    this.input.placeholder = "Type to filter...";
    this.input.spellcheck = false;

    const clearBtn = document.createElement("button");
    clearBtn.className = "filter-clear-btn";
    clearBtn.textContent = "\u00d7";
    clearBtn.title = "Clear filter";
    clearBtn.addEventListener("click", () => {
      this.input.value = "";
      this.onChange("");
    });

    wrapper.appendChild(label);
    wrapper.appendChild(this.input);
    wrapper.appendChild(clearBtn);
    container.appendChild(wrapper);

    this.input.addEventListener("input", () => {
      this.onChange(this.input.value);
    });
  }

  getValue(): string {
    return this.input.value;
  }

  clear(): void {
    this.input.value = "";
    this.onChange("");
  }
}
