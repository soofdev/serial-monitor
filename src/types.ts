export interface PortInfo {
  name: string;
  description: string;
}

export interface SerialData {
  data: string;
  port: string;
}

export interface SerialStatus {
  port: string;
  status: string;
  message: string;
}

export interface LineEntry {
  text: string;
  timestamp: number;
}

export interface FlashProgress {
  stage: "flashing" | "verifying" | "done" | "error";
  current: number;
  total: number;
  percentage: number;
  message: string;
}

export interface ChipInfo {
  chip: string;
  default_addr: number;
  flash_size: string;
}
