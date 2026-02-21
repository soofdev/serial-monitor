import { invoke, Channel } from "@tauri-apps/api/core";
import type { PortInfo, SerialData } from "./types";

export async function listPorts(): Promise<PortInfo[]> {
  return invoke<PortInfo[]>("list_ports");
}

export async function connectPort(
  port: string,
  baudRate: number,
  onData: (data: SerialData) => void
): Promise<void> {
  const channel = new Channel<SerialData>();
  channel.onmessage = onData;
  return invoke("connect", { port, baudRate, onData: channel });
}

export async function disconnectPort(port: string): Promise<void> {
  return invoke("disconnect", { port });
}

export async function sendToPort(
  port: string,
  data: string,
  lineEnding: string
): Promise<void> {
  return invoke("send", { port, data, lineEnding });
}

export async function startLog(
  port: string,
  filePath: string,
  timestamps: boolean
): Promise<void> {
  return invoke("start_log", { port, filePath, timestamps });
}

export async function stopLog(port: string): Promise<void> {
  return invoke("stop_log", { port });
}
