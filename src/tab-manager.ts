import { Connection, type ConnectionStatus } from "./connection";

export class TabManager {
  private tabs = new Map<string, Connection>();
  private activeTab: string | null = null;
  private tabBar: HTMLElement;
  private panelContainer: HTMLElement;
  private onEmpty: () => void;

  constructor(
    tabBar: HTMLElement,
    panelContainer: HTMLElement,
    onEmpty: () => void
  ) {
    this.tabBar = tabBar;
    this.panelContainer = panelContainer;
    this.onEmpty = onEmpty;
  }

  async addConnection(port: string, baudRate: number): Promise<void> {
    if (this.tabs.has(port)) {
      this.switchTo(port);
      return;
    }

    const conn = new Connection(port, baudRate);
    conn.onStatusChange = (status: ConnectionStatus) => {
      this.updateTabLabel(port, status);
    };

    this.tabs.set(port, conn);
    this.panelContainer.appendChild(conn.panel);

    // Create tab button
    const tab = document.createElement("div");
    tab.className = "tab";
    tab.dataset.port = port;

    const label = document.createElement("span");
    label.className = "tab-label";
    label.textContent = port;
    tab.appendChild(label);

    const statusDot = document.createElement("span");
    statusDot.className = "tab-status-dot";
    tab.appendChild(statusDot);

    const closeBtn = document.createElement("button");
    closeBtn.className = "tab-close";
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.closeTab(port);
    });
    tab.appendChild(closeBtn);

    tab.addEventListener("click", () => this.switchTo(port));

    // Insert before the "+" button
    const addBtn = this.tabBar.querySelector(".tab-add");
    this.tabBar.insertBefore(tab, addBtn);

    // Connect
    try {
      await conn.connect();
    } catch (e) {
      conn.panel.remove();
      tab.remove();
      this.tabs.delete(port);
      throw e;
    }

    this.switchTo(port);
  }

  switchTo(port: string): void {
    if (!this.tabs.has(port)) return;

    // Hide all panels
    for (const [key, conn] of this.tabs) {
      conn.hide();
      const tab = this.tabBar.querySelector(`.tab[data-port="${key}"]`);
      tab?.classList.remove("tab-active");
    }

    // Show selected
    const conn = this.tabs.get(port)!;
    conn.show();
    const tab = this.tabBar.querySelector(`.tab[data-port="${port}"]`);
    tab?.classList.add("tab-active");
    this.activeTab = port;
  }

  async closeTab(port: string): Promise<void> {
    const conn = this.tabs.get(port);
    if (!conn) return;

    await conn.disconnect();
    conn.panel.remove();

    const tab = this.tabBar.querySelector(`.tab[data-port="${port}"]`);
    tab?.remove();

    this.tabs.delete(port);

    // Switch to another tab or show empty state
    if (this.tabs.size > 0) {
      const nextPort = this.tabs.keys().next().value!;
      this.switchTo(nextPort);
    } else {
      this.activeTab = null;
      this.onEmpty();
    }
  }

  getActiveConnection(): Connection | null {
    if (!this.activeTab) return null;
    return this.tabs.get(this.activeTab) ?? null;
  }

  hasConnection(port: string): boolean {
    return this.tabs.has(port);
  }

  hideAll(): void {
    for (const [key, conn] of this.tabs) {
      conn.hide();
      const tab = this.tabBar.querySelector(`.tab[data-port="${key}"]`);
      tab?.classList.remove("tab-active");
    }
    this.activeTab = null;
  }

  switchNext(): void {
    const keys = [...this.tabs.keys()];
    if (keys.length === 0) return;
    const idx = this.activeTab ? keys.indexOf(this.activeTab) : -1;
    const next = keys[(idx + 1) % keys.length];
    this.switchTo(next);
  }

  switchPrev(): void {
    const keys = [...this.tabs.keys()];
    if (keys.length === 0) return;
    const idx = this.activeTab ? keys.indexOf(this.activeTab) : 0;
    const prev = keys[(idx - 1 + keys.length) % keys.length];
    this.switchTo(prev);
  }

  private updateTabLabel(port: string, status: ConnectionStatus): void {
    const tab = this.tabBar.querySelector(`.tab[data-port="${port}"]`);
    if (!tab) return;
    const dot = tab.querySelector(".tab-status-dot") as HTMLElement;
    if (dot) {
      dot.className = `tab-status-dot status-${status}`;
    }
  }
}
