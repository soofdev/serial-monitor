import { invoke, Channel } from "@tauri-apps/api/core";
import type { FlashProgress, ChipInfo } from "./types";

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

export async function detectChip(port: string): Promise<ChipInfo> {
  return invoke<ChipInfo>("detect_chip", { port });
}
