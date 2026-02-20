import { listPorts } from "./serial-api";
import { TabManager } from "./tab-manager";
import type { PortInfo } from "./types";
import "./styles.css";

let tabManager: TabManager;
let portSelect: HTMLSelectElement;
let baudSelect: HTMLSelectElement;
let connectBtn: HTMLButtonElement;
let refreshBtn: HTMLButtonElement;
let connectPanel: HTMLElement;
let portAutoDetectTimer: ReturnType<typeof setInterval> | null = null;
let knownPorts: string[] = [];

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

function init(): void {
  const app = document.getElementById("app")!;
  app.innerHTML = "";

  // Tab bar
  const tabBar = document.createElement("div");
  tabBar.className = "tab-bar";

  const addTabBtn = document.createElement("button");
  addTabBtn.className = "tab-add";
  addTabBtn.textContent = "+";
  addTabBtn.title = "New connection";
  addTabBtn.addEventListener("click", () => showConnectPanel());
  tabBar.appendChild(addTabBtn);

  app.appendChild(tabBar);

  // Panel container (holds connection panels)
  const panelContainer = document.createElement("div");
  panelContainer.className = "panel-container";
  app.appendChild(panelContainer);

  // Connect panel (port selection)
  connectPanel = document.createElement("div");
  connectPanel.className = "connect-panel";

  const connectForm = document.createElement("div");
  connectForm.className = "connect-form";

  const title = document.createElement("h2");
  title.textContent = "Connect to Serial Port";
  connectForm.appendChild(title);

  // Port row
  const portRow = document.createElement("div");
  portRow.className = "form-row";

  const portLabel = document.createElement("label");
  portLabel.textContent = "Port";
  portRow.appendChild(portLabel);

  portSelect = document.createElement("select");
  portSelect.className = "port-select";
  portRow.appendChild(portSelect);

  refreshBtn = document.createElement("button");
  refreshBtn.className = "toolbar-btn";
  refreshBtn.textContent = "Refresh";
  refreshBtn.addEventListener("click", () => refreshPorts());
  portRow.appendChild(refreshBtn);

  connectForm.appendChild(portRow);

  // Baud row
  const baudRow = document.createElement("div");
  baudRow.className = "form-row";

  const baudLabel = document.createElement("label");
  baudLabel.textContent = "Baud Rate";
  baudRow.appendChild(baudLabel);

  baudSelect = document.createElement("select");
  baudSelect.className = "baud-select";
  for (const rate of BAUD_RATES) {
    const opt = document.createElement("option");
    opt.value = rate.toString();
    opt.textContent = rate.toString();
    if (rate === 115200) opt.selected = true;
    baudSelect.appendChild(opt);
  }
  baudRow.appendChild(baudSelect);

  connectForm.appendChild(baudRow);

  // Connect button
  connectBtn = document.createElement("button");
  connectBtn.className = "connect-btn";
  connectBtn.textContent = "Connect";
  connectBtn.addEventListener("click", () => handleConnect());
  connectForm.appendChild(connectBtn);

  connectPanel.appendChild(connectForm);
  panelContainer.appendChild(connectPanel);

  // Empty state splash
  const splash = document.createElement("div");
  splash.className = "splash";
  splash.innerHTML = `
    <div class="splash-icon">&#9107;</div>
    <p>No active connections</p>
    <p class="splash-hint">Select a port above and click Connect, or press <kbd>Ctrl+Shift+T</kbd></p>
  `;
  connectPanel.appendChild(splash);

  // Initialize TabManager
  tabManager = new TabManager(tabBar, panelContainer, () => {
    showConnectPanel();
  });

  // Initial port refresh
  refreshPorts();

  // Auto-detect ports every 2s
  startPortAutoDetect();

  // Keyboard shortcuts
  document.addEventListener("keydown", handleGlobalKeydown);
}

function showConnectPanel(): void {
  connectPanel.style.display = "flex";
  refreshPorts();
}

function hideConnectPanel(): void {
  connectPanel.style.display = "none";
}

async function refreshPorts(): Promise<void> {
  try {
    const ports = await listPorts();
    updatePortDropdown(ports);
  } catch (e) {
    console.error("Failed to list ports:", e);
  }
}

function updatePortDropdown(ports: PortInfo[]): void {
  const currentValue = portSelect.value;
  portSelect.innerHTML = "";

  if (ports.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No ports found";
    opt.disabled = true;
    portSelect.appendChild(opt);
    connectBtn.disabled = true;
    return;
  }

  connectBtn.disabled = false;

  for (const p of ports) {
    const opt = document.createElement("option");
    opt.value = p.name;
    opt.textContent = `${p.name} - ${p.description}`;
    portSelect.appendChild(opt);
  }

  // Restore previous selection if still available
  if (ports.some((p) => p.name === currentValue)) {
    portSelect.value = currentValue;
  }
}

async function handleConnect(): Promise<void> {
  const port = portSelect.value;
  const baudRate = parseInt(baudSelect.value);

  if (!port) return;

  if (tabManager.hasConnection(port)) {
    showToast(`Already connected to ${port}`, "error");
    return;
  }

  connectBtn.disabled = true;
  connectBtn.textContent = "Connecting...";

  try {
    await tabManager.addConnection(port, baudRate);
    hideConnectPanel();
  } catch (e) {
    showToast(`Connection failed: ${e}`, "error");
  } finally {
    connectBtn.disabled = false;
    connectBtn.textContent = "Connect";
  }
}

function startPortAutoDetect(): void {
  portAutoDetectTimer = setInterval(async () => {
    try {
      const ports = await listPorts();
      const portNames = ports.map((p) => p.name);

      // Check for new ports
      const newPorts = portNames.filter((p) => !knownPorts.includes(p));
      if (newPorts.length > 0) {
        showToast(`New port detected: ${newPorts.join(", ")}`, "info");
      }

      knownPorts = portNames;

      // Update dropdown if connect panel is visible
      if (connectPanel.style.display !== "none") {
        updatePortDropdown(ports);
      }
    } catch (_) {
      // Silently ignore polling errors
    }
  }, 2000);
}

function handleGlobalKeydown(e: KeyboardEvent): void {
  // Ctrl+Shift+T: New connection
  if (e.ctrlKey && e.shiftKey && e.key === "T") {
    e.preventDefault();
    showConnectPanel();
  }
  // Ctrl+L: Clear active terminal
  if (e.ctrlKey && e.key === "l") {
    e.preventDefault();
    const conn = tabManager.getActiveConnection();
    conn?.terminal.clear();
  }
}

function showToast(message: string, type: "info" | "error" = "info"): void {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("toast-fade");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Cleanup on unload
window.addEventListener("beforeunload", () => {
  if (portAutoDetectTimer) clearInterval(portAutoDetectTimer);
});

// Start the app
init();
