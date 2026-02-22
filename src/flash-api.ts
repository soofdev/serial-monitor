import { invoke, Channel } from "@tauri-apps/api/core";
import type { FlashProgress, ChipInfo, IdfProjectInfo } from "./types";

export async function flashFirmware(
  port: string,
  filePath: string,
  flashAddr: number,
  baudRate: number | null,
  onProgress: (progress: FlashProgress) => void
): Promise<void> {
  const channel = new Channel<FlashProgress>();
  channel.onmessage = onProgress;
  return invoke("flash_firmware", {
    port,
    filePath,
    flashAddr,
    baudRate,
    onProgress: channel,
  });
}

export async function parseIdfProject(buildDir: string): Promise<IdfProjectInfo> {
  return invoke<IdfProjectInfo>("parse_idf_project", { buildDir });
}

export async function flashIdfProject(
  port: string,
  buildDir: string,
  appOnly: boolean,
  baudRate: number | null,
  onProgress: (progress: FlashProgress) => void
): Promise<void> {
  const channel = new Channel<FlashProgress>();
  channel.onmessage = onProgress;
  return invoke("flash_idf_project", {
    port,
    buildDir,
    appOnly,
    baudRate,
    onProgress: channel,
  });
}

export async function detectChip(port: string): Promise<ChipInfo> {
  return invoke<ChipInfo>("detect_chip", { port });
}
