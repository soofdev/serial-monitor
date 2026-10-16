import { invoke, Channel } from "@tauri-apps/api/core";

export interface ArduinoCliStatus {
  available: boolean;
  version: string | null;
  esp32_core_installed: boolean;
  esp32_core_version: string | null;
  error: string | null;
}

export interface CompileLog {
  stream: "stdout" | "stderr";
  line: string;
}

export interface CompileResult {
  ok: boolean;
  binary_path: string | null;
  sketch_dir: string | null;
  exit_code: number | null;
}

export type InstallProgress =
  | { stage: "starting"; url: string; asset: string }
  | { stage: "downloading"; current: number; total: number }
  | { stage: "extracting" }
  | { stage: "verifying" }
  | { stage: "done"; path: string; version: string | null }
  | { stage: "error"; message: string };

export interface InstallResult {
  ok: boolean;
  path: string | null;
  error: string | null;
}

export async function installArduinoCli(
  onProgress: (event: InstallProgress) => void
): Promise<InstallResult> {
  const channel = new Channel<InstallProgress>();
  channel.onmessage = onProgress;
  return invoke<InstallResult>("install_arduino_cli", { onProgress: channel });
}

export async function installEsp32Core(
  onLog: (entry: CompileLog) => void
): Promise<void> {
  const channel = new Channel<CompileLog>();
  channel.onmessage = onLog;
  return invoke<void>("install_esp32_core", { onLog: channel });
}

export async function uploadSketch(
  port: string,
  fqbn: string,
  sketchRoot: string,
  onLog: (entry: CompileLog) => void
): Promise<void> {
  const channel = new Channel<CompileLog>();
  channel.onmessage = onLog;
  return invoke<void>("upload_sketch", {
    port,
    fqbn,
    sketchRoot,
    onLog: channel,
  });
}

export async function detectArduinoCli(): Promise<ArduinoCliStatus> {
  return invoke<ArduinoCliStatus>("detect_arduino_cli");
}

export async function compileSketch(
  source: string,
  fqbn: string,
  onLog: (entry: CompileLog) => void
): Promise<CompileResult> {
  const channel = new Channel<CompileLog>();
  channel.onmessage = onLog;
  return invoke<CompileResult>("compile_sketch", {
    source,
    fqbn,
    onLog: channel,
  });
}
