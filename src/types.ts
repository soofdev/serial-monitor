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
