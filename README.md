# Serial Monitor

A lightweight, cross-platform desktop serial monitor built for ESP32 development. Connect to multiple serial devices simultaneously with full bidirectional communication, filtering, logging, and firmware flashing.

Built with [Tauri 2](https://tauri.app/), TypeScript, and Rust.

## Features

- **Multi-device support** — Open unlimited concurrent serial connections in tabs
- **Real-time terminal** — Dark-themed terminal output with auto-scroll and 10K line buffer
- **Firmware flashing** — Flash ESP32 firmware via single binary or ESP-IDF project mode
- **Command input** — Send commands with configurable line endings (LF, CR, CRLF) and history (Up/Down arrows)
- **Filtering** — Real-time case-insensitive text filtering without data loss
- **Log to file** — Toggle file logging with optional timestamps, auto-named `SerialLog_<port>_<timestamp>.txt`
- **Auto-reconnect** — Automatically reconnects on USB unplug or device reset (up to 30 attempts)
- **Timestamps** — Optional `[HH:MM:SS.mmm]` prefix per line
- **Baud rate presets** — 9600, 19200, 38400, 57600, 115200 (default), 230400, 460800, 921600

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+T` | New connection |
| `Ctrl+Tab` | Next tab |
| `Ctrl+Shift+Tab` | Previous tab |
| `Ctrl+L` | Clear terminal |

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [Rust](https://rustup.rs/) stable toolchain
- macOS or Windows

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

## Building

```bash
# Build for production
npm run tauri build
```

Output:
- **macOS** — `.dmg` in `src-tauri/target/release/bundle/dmg/`
- **Windows** — `.exe` and `.msi` in `src-tauri/target/release/bundle/`

## Testing

```bash
npm run test
```

## Project Structure

```
src/                    # TypeScript frontend (vanilla DOM, no framework)
  main.ts               # App entry point
  tab-manager.ts        # Multi-tab lifecycle
  connection.ts         # Per-connection UI & state
  terminal.ts           # Terminal display & line management
  command-input.ts      # Command input with history
  filter.ts             # Real-time filter component
  flash-panel.ts        # Firmware flashing UI
  serial-api.ts         # Tauri IPC bridge
  flash-api.ts          # Flash operation APIs
  types.ts              # TypeScript interfaces
  styles.css            # Dark theme (Catppuccin)

src-tauri/              # Rust backend
  src/
    lib.rs              # Tauri app builder
    commands.rs         # Tauri commands (list_ports, connect, send, etc.)
    serial.rs           # Serial I/O & read loop
    state.rs            # Connection state management
    flash.rs            # ESP32 flashing via espflash
```

## License

MIT License. See [LICENSE](LICENSE) for details.

## Screenshots

<img width="902" height="699" alt="Screenshot 2026-02-22 at 5 35 11 PM" src="https://github.com/user-attachments/assets/70e8aeb6-74a8-426b-8078-225978e9a6a7" />

<img width="894" height="696" alt="Screenshot 2026-02-22 at 5 35 44 PM" src="https://github.com/user-attachments/assets/1ae1878f-dadc-4f20-be04-af21bc138c58" />

<img width="895" height="697" alt="Screenshot 2026-02-22 at 5 36 26 PM" src="https://github.com/user-attachments/assets/9fa8a95e-dc6e-41a0-bd4b-7c707de2170a" />

<img width="897" height="697" alt="Screenshot 2026-02-22 at 5 36 36 PM" src="https://github.com/user-attachments/assets/48279229-8bd7-4a7f-b738-17b1bce8636e" />

<img width="550" height="450" alt="Screenshot 2026-02-22 at 3 04 10 PM" src="https://github.com/user-attachments/assets/0fd3e4d8-7a51-4dba-a796-dfd364d85598" />
