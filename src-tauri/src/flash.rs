use espflash::connection::{Connection, ResetAfterOperation, ResetBeforeOperation};
use espflash::flasher::Flasher;
use espflash::target::ProgressCallbacks;
use serde::Serialize;
use serialport::SerialPortType;
use tauri::ipc::Channel;

#[derive(Debug, Clone, Serialize)]
pub struct FlashProgress {
    pub stage: String,
    pub current: usize,
    pub total: usize,
    pub percentage: f32,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChipInfo {
    pub chip: String,
    pub default_addr: u32,
    pub flash_size: String,
}

/// Bridge between espflash's ProgressCallbacks and Tauri's Channel.
pub struct TauriProgressCallbacks {
    channel: Channel<FlashProgress>,
    addr: u32,
    total: usize,
}

impl TauriProgressCallbacks {
    pub fn new(channel: Channel<FlashProgress>) -> Self {
        Self {
            channel,
            addr: 0,
            total: 0,
        }
    }
}

impl ProgressCallbacks for TauriProgressCallbacks {
    fn init(&mut self, addr: u32, total: usize) {
        self.addr = addr;
        self.total = total;
        let _ = self.channel.send(FlashProgress {
            stage: "flashing".into(),
            current: 0,
            total,
            percentage: 0.0,
            message: format!("Writing {} bytes at 0x{:08X}...", total, addr),
        });
    }

    fn update(&mut self, current: usize) {
        let pct = if self.total > 0 {
            (current as f32 / self.total as f32) * 100.0
        } else {
            0.0
        };
        let _ = self.channel.send(FlashProgress {
            stage: "flashing".into(),
            current,
            total: self.total,
            percentage: pct,
            message: format!("Writing... {:.1}%", pct),
        });
    }

    fn verifying(&mut self) {
        let _ = self.channel.send(FlashProgress {
            stage: "verifying".into(),
            current: self.total,
            total: self.total,
            percentage: 100.0,
            message: "Verifying flash...".into(),
        });
    }

    fn finish(&mut self, skipped: bool) {
        let msg = if skipped {
            "Skipped (already up to date)"
        } else {
            "Flash complete!"
        };
        let _ = self.channel.send(FlashProgress {
            stage: "done".into(),
            current: self.total,
            total: self.total,
            percentage: 100.0,
            message: msg.into(),
        });
    }
}

/// Find USB port info for the given port name.
fn find_usb_port_info(port_name: &str) -> Result<serialport::UsbPortInfo, String> {
    let ports = serialport::available_ports().map_err(|e| format!("Failed to list ports: {}", e))?;
    for port in ports {
        if port.port_name == port_name {
            if let SerialPortType::UsbPort(info) = port.port_type {
                return Ok(info);
            }
        }
    }
    // Return a default UsbPortInfo if we can't find the exact match
    // (some adapters may not report full USB info)
    // Return a default UsbPortInfo for non-USB ports or unrecognized adapters
    Ok(serialport::UsbPortInfo {
        vid: 0,
        pid: 0,
        serial_number: None,
        manufacturer: None,
        product: None,
    })
}

/// Flash a binary file to the connected ESP chip.
pub fn flash_binary(
    port_name: &str,
    bin_path: &str,
    flash_addr: u32,
    baud_rate: Option<u32>,
    progress: &mut dyn ProgressCallbacks,
) -> Result<(), String> {
    // Read the firmware file
    let data =
        std::fs::read(bin_path).map_err(|e| format!("Failed to read firmware file: {}", e))?;

    if data.is_empty() {
        return Err("Firmware file is empty".into());
    }

    // Open the serial port using native type (required by espflash)
    let serial = serialport::new(port_name, 115_200)
        .timeout(std::time::Duration::from_secs(3))
        .open_native()
        .map_err(|e| format!("Failed to open port {}: {}", port_name, e))?;

    let port_info = find_usb_port_info(port_name)?;

    // Create espflash Connection
    let connection = Connection::new(
        serial,
        port_info,
        ResetAfterOperation::HardReset,
        ResetBeforeOperation::DefaultReset,
        115_200,
    );

    // Connect the Flasher (enters bootloader, detects chip, loads stub)
    let mut flasher = Flasher::connect(
        connection,
        true,      // use flash stub (faster)
        true,      // verify after write
        false,     // don't skip unchanged
        None,      // auto-detect chip
        baud_rate, // optional higher baud for transfer
    )
    .map_err(|e| format!("Failed to connect to bootloader: {}", e))?;

    // Write binary to flash
    flasher
        .write_bin_to_flash(flash_addr, &data, progress)
        .map_err(|e| format!("Flash write failed: {}", e))?;

    Ok(())
}

/// Detect the connected ESP chip type.
pub fn detect_chip_info(port_name: &str) -> Result<ChipInfo, String> {
    let serial = serialport::new(port_name, 115_200)
        .timeout(std::time::Duration::from_secs(3))
        .open_native()
        .map_err(|e| format!("Failed to open port {}: {}", port_name, e))?;

    let port_info = find_usb_port_info(port_name)?;

    let connection = Connection::new(
        serial,
        port_info,
        ResetAfterOperation::HardReset,
        ResetBeforeOperation::DefaultReset,
        115_200,
    );

    let mut flasher = Flasher::connect(connection, true, false, false, None, None)
        .map_err(|e| format!("Failed to connect: {}", e))?;

    let chip = flasher.chip();
    let flash_size = flasher
        .flash_detect()
        .ok()
        .flatten()
        .map(|s| format!("{s}"))
        .unwrap_or_else(|| "Unknown".to_string());

    let (chip_name, default_addr) = match chip {
        espflash::target::Chip::Esp32 => ("ESP32", 0x10000),
        espflash::target::Chip::Esp32c2 => ("ESP32-C2", 0x10000),
        espflash::target::Chip::Esp32c3 => ("ESP32-C3", 0x10000),
        espflash::target::Chip::Esp32c5 => ("ESP32-C5", 0x10000),
        espflash::target::Chip::Esp32c6 => ("ESP32-C6", 0x10000),
        espflash::target::Chip::Esp32h2 => ("ESP32-H2", 0x10000),
        espflash::target::Chip::Esp32p4 => ("ESP32-P4", 0x10000),
        espflash::target::Chip::Esp32s2 => ("ESP32-S2", 0x10000),
        espflash::target::Chip::Esp32s3 => ("ESP32-S3", 0x10000),
        _ => ("Unknown ESP", 0x10000),
    };

    Ok(ChipInfo {
        chip: chip_name.to_string(),
        default_addr,
        flash_size,
    })
}
