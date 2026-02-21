# PRD: ESP32 Serial Monitor

## Overview

A lightweight, cross-platform desktop serial monitor built for ESP32 development and debugging. Supports simultaneous connections to multiple devices with bidirectional communication.

**Stack:** Tauri 2 + TypeScript + Vite + Rust
**Platforms:** Windows, macOS

---

## Core Requirements

### 1. Serial Port Management

- **Port Discovery:** List all available serial ports with device names (e.g., `COM3`, `/dev/cu.usbserial-0001`)
- **Port Refresh:** Manually refresh the port list; auto-detect new/removed devices
- **Connect/Disconnect:** Connect to a selected port with a chosen baud rate; cleanly disconnect
- **Baud Rate Presets:** Dropdown with common rates: 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600

### 2. Multi-Device Support

- Open multiple serial connections simultaneously
- Each connection displayed in its own **tab**
- Tabs show port name and connection status
- Independent settings (baud rate, timestamps, filters) per tab

### 3. Monitor Display

- Terminal-style output area displaying incoming serial data
- **Auto-scroll:** Enabled by default; toggle on/off via button
- **Clear:** Button to clear the monitor output for the active tab
- **Timestamps:** Toggle to prepend `[HH:MM:SS.mmm]` to each line
- Monospace font, high-contrast theme suitable for long debugging sessions

### 4. Send Commands

- Text input field at the bottom of each tab
- Send on Enter key
- **Line ending selector:** None, Newline (`\n`), Carriage Return (`\r`), Both (`\r\n`)
- Command history accessible with Up/Down arrow keys

### 5. Filtering & Search

- Real-time text filter input that shows/hides lines matching the query
- Filter does not discard data — disabling the filter restores full output
- Simple text match (case-insensitive)

### 6. Auto-Reconnect

- Detect when a device disconnects (USB unplug, ESP32 reset)
- Automatically attempt to reconnect at a regular interval (1 second)
- Visual indicator showing reconnection status
- Reconnect preserves existing monitor output

### 7. Log to File

- Toggle to enable logging output to a file
- Default log path: user's documents folder, filename includes port name and date
- Log includes raw output (with optional timestamps)

---

## UI Layout

```
+---------------------------------------------------------------+
|  [Tab: COM3 - Connected]  [Tab: COM5 - Connected]  [+]       |
+---------------------------------------------------------------+
|  [Filter: ________]  [Timestamps: ON/OFF]  [Log: ON/OFF]     |
+---------------------------------------------------------------+
|                                                                |
|  [12:03:45.123] ESP32 boot complete                           |
|  [12:03:45.200] WiFi connecting...                            |
|  [12:03:46.512] WiFi connected: 192.168.1.42                 |
|  [12:03:46.515] MQTT broker connected                        |
|  [12:03:47.001] Sensor reading: temp=23.5 hum=61.2           |
|                                                                |
|                                                                |
+---------------------------------------------------------------+
|  [> Send: ___________________________] [Line ending: \n v]    |
|  [Auto-scroll: ON]  [Clear]              [Baud: 115200 v]    |
+---------------------------------------------------------------+
```

---

## Rust Backend (Tauri Commands)

| Command | Description |
|---|---|
| `list_ports()` | Returns available serial ports |
| `connect(port, baud_rate)` | Opens a serial connection, starts streaming data via events |
| `disconnect(port)` | Closes the connection |
| `send(port, data, line_ending)` | Sends a string to the device |
| `start_log(port, file_path)` | Begins logging output to a file |
| `stop_log(port)` | Stops logging |

Serial data is streamed from Rust to the frontend using **Tauri events** (not polling).

---

## Technical Notes

- **Serial crate:** `serialport` (Rust) for cross-platform serial I/O
- **Async runtime:** Tokio for managing multiple concurrent serial connections
- **Data flow:** Each connection spawns a Tokio task that reads from the port and emits Tauri events to the frontend
- **Buffer management:** Frontend maintains a capped line buffer per tab (e.g., 10,000 lines) to prevent memory bloat during long sessions
- **Thread safety:** Each serial connection managed independently; no shared mutable state between connections

---

## Out of Scope (V1)

- Serial plotter / graphing
- Binary / hex display mode
- Plugin or macro system
- Built-in OTA firmware upload
- Themes or appearance customization

---

## Success Criteria

- Can connect to an ESP32 over USB and see `Serial.println()` output within 3 seconds of launch
- Handles ESP32 reset (RTS/DTR) without crashing
- Works reliably on both Windows and macOS
- App binary is under 15MB
