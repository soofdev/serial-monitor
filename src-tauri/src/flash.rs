use espflash::connection::{Connection, ResetAfterOperation, ResetBeforeOperation};
use espflash::flasher::Flasher;
use espflash::image_format::Segment;
use espflash::target::ProgressCallbacks;
use serde::{Deserialize, Serialize};
use serialport::SerialPortType;
use std::borrow::Cow;
use std::collections::HashMap;
use std::path::Path;
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

#[derive(Debug, Clone, Serialize)]
pub struct FlashSegmentInfo {
    pub name: String,
    pub offset: String,
    pub file: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct IdfProjectInfo {
    pub chip: String,
    pub flash_mode: String,
    pub flash_size: String,
    pub flash_freq: String,
    pub app_name: String,
    pub segments: Vec<FlashSegmentInfo>,
}

/// Parsed flasher_args.json from ESP-IDF build output.
#[derive(Debug, Deserialize)]
struct FlasherArgs {
    flash_settings: FlashSettings,
    flash_files: HashMap<String, String>,
    #[serde(default)]
    app: Option<FlasherSegment>,
    #[serde(default)]
    bootloader: Option<FlasherSegment>,
    #[serde(rename = "partition-table", default)]
    partition_table: Option<FlasherSegment>,
    #[serde(default)]
    otadata: Option<FlasherSegment>,
    extra_esptool_args: Option<ExtraArgs>,
}

#[derive(Debug, Deserialize)]
struct FlashSettings {
    flash_mode: String,
    flash_size: String,
    flash_freq: String,
}

#[derive(Debug, Deserialize)]
struct FlasherSegment {
    offset: String,
    file: String,
    #[allow(dead_code)]
    encrypted: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ExtraArgs {
    chip: Option<String>,
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

/// Progress wrapper for multi-segment flashing that tracks overall progress.
/// When used with write_bins_to_flash, init() is called once per segment automatically.
pub struct MultiSegmentProgress {
    pub channel: Channel<FlashProgress>,
    segment_index: usize,
    segment_count: usize,
    addr: u32,
    total: usize,
}

impl MultiSegmentProgress {
    pub fn new(channel: Channel<FlashProgress>, segment_count: usize) -> Self {
        Self {
            channel,
            segment_index: 0,
            segment_count,
            addr: 0,
            total: 0,
        }
    }

    fn overall_pct(&self, segment_pct: f32) -> f32 {
        if self.segment_count == 0 {
            return segment_pct;
        }
        let per_segment = 100.0 / self.segment_count as f32;
        (self.segment_index as f32 * per_segment) + (segment_pct / 100.0 * per_segment)
    }
}

impl ProgressCallbacks for MultiSegmentProgress {
    fn init(&mut self, addr: u32, total: usize) {
        self.addr = addr;
        self.total = total;
        let _ = self.channel.send(FlashProgress {
            stage: "flashing".into(),
            current: 0,
            total,
            percentage: self.overall_pct(0.0),
            message: format!(
                "[{}/{}] Writing {} bytes at 0x{:08X}...",
                self.segment_index + 1,
                self.segment_count,
                total,
                addr
            ),
        });
    }

    fn update(&mut self, current: usize) {
        let seg_pct = if self.total > 0 {
            (current as f32 / self.total as f32) * 100.0
        } else {
            0.0
        };
        let _ = self.channel.send(FlashProgress {
            stage: "flashing".into(),
            current,
            total: self.total,
            percentage: self.overall_pct(seg_pct),
            message: format!(
                "[{}/{}] Writing at 0x{:08X}... {:.1}%",
                self.segment_index + 1,
                self.segment_count,
                self.addr,
                seg_pct
            ),
        });
    }

    fn verifying(&mut self) {
        let _ = self.channel.send(FlashProgress {
            stage: "verifying".into(),
            current: self.total,
            total: self.total,
            percentage: self.overall_pct(100.0),
            message: format!(
                "[{}/{}] Verifying 0x{:08X}...",
                self.segment_index + 1,
                self.segment_count,
                self.addr
            ),
        });
    }

    fn finish(&mut self, _skipped: bool) {
        self.segment_index += 1;
        let _ = self.channel.send(FlashProgress {
            stage: "flashing".into(),
            current: self.total,
            total: self.total,
            percentage: self.overall_pct(0.0),
            message: format!(
                "[{}/{}] Segment at 0x{:08X} done",
                self.segment_index,
                self.segment_count,
                self.addr
            ),
        });
    }
}

/// Find USB port info for the given port name.
fn find_usb_port_info(port_name: &str) -> Result<serialport::UsbPortInfo, String> {
    let ports =
        serialport::available_ports().map_err(|e| format!("Failed to list ports: {}", e))?;
    for port in ports {
        if port.port_name == port_name {
            if let SerialPortType::UsbPort(info) = port.port_type {
                return Ok(info);
            }
        }
    }
    Ok(serialport::UsbPortInfo {
        vid: 0,
        pid: 0,
        serial_number: None,
        manufacturer: None,
        product: None,
    })
}

/// Open a connection to the ESP flasher.
fn open_flasher(port_name: &str, baud_rate: Option<u32>) -> Result<Flasher, String> {
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

    Flasher::connect(connection, true, true, false, None, baud_rate)
        .map_err(|e| format!("Failed to connect to bootloader: {}", e))
}

/// Flash a single binary file to the connected ESP chip.
pub fn flash_binary(
    port_name: &str,
    bin_path: &str,
    flash_addr: u32,
    baud_rate: Option<u32>,
    progress: &mut dyn ProgressCallbacks,
) -> Result<(), String> {
    let data =
        std::fs::read(bin_path).map_err(|e| format!("Failed to read firmware file: {}", e))?;

    if data.is_empty() {
        return Err("Firmware file is empty".into());
    }

    let mut flasher = open_flasher(port_name, baud_rate)?;

    flasher
        .write_bin_to_flash(flash_addr, &data, progress)
        .map_err(|e| format!("Flash write failed: {}", e))?;

    Ok(())
}

/// Parse flasher_args.json from an ESP-IDF build directory.
pub fn parse_idf_flasher_args(build_dir: &str) -> Result<IdfProjectInfo, String> {
    let build_path = Path::new(build_dir);
    let args_path = build_path.join("flasher_args.json");

    if !args_path.exists() {
        return Err(format!(
            "flasher_args.json not found in {}. Is this an ESP-IDF build directory?",
            build_dir
        ));
    }

    let content =
        std::fs::read_to_string(&args_path).map_err(|e| format!("Failed to read {}: {}", args_path.display(), e))?;

    let args: FlasherArgs =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse flasher_args.json: {}", e))?;

    let chip = args
        .extra_esptool_args
        .as_ref()
        .and_then(|a| a.chip.clone())
        .unwrap_or_else(|| "unknown".to_string());

    // Determine app name from the app binary filename
    let app_name = args
        .app
        .as_ref()
        .map(|a| {
            Path::new(&a.file)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "app".to_string())
        })
        .unwrap_or_else(|| "app".to_string());

    // Build ordered segment list from flash_files
    let mut segments: Vec<FlashSegmentInfo> = Vec::new();

    // Define segment order and friendly names
    let named_segments = [
        (&args.bootloader, "Bootloader"),
        (&args.partition_table, "Partition Table"),
        (&args.otadata, "OTA Data"),
        (&args.app, "Application"),
    ];

    for (seg, name) in &named_segments {
        if let Some(s) = seg {
            let file_path = build_path.join(&s.file);
            let size = std::fs::metadata(&file_path)
                .map(|m| m.len())
                .unwrap_or(0);

            segments.push(FlashSegmentInfo {
                name: name.to_string(),
                offset: s.offset.clone(),
                file: s.file.clone(),
                size,
            });
        }
    }

    // Check for any extra flash_files not covered by named segments
    let named_files: Vec<&str> = named_segments
        .iter()
        .filter_map(|(seg, _)| seg.as_ref().map(|s| s.file.as_str()))
        .collect();

    for (offset, file) in &args.flash_files {
        if !named_files.contains(&file.as_str()) {
            let file_path = build_path.join(file);
            let size = std::fs::metadata(&file_path)
                .map(|m| m.len())
                .unwrap_or(0);
            let name = Path::new(file)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| file.clone());
            segments.push(FlashSegmentInfo {
                name,
                offset: offset.clone(),
                file: file.clone(),
                size,
            });
        }
    }

    // Sort by offset
    segments.sort_by_key(|s| {
        u32::from_str_radix(s.offset.trim_start_matches("0x"), 16).unwrap_or(0)
    });

    Ok(IdfProjectInfo {
        chip,
        flash_mode: args.flash_settings.flash_mode,
        flash_size: args.flash_settings.flash_size,
        flash_freq: args.flash_settings.flash_freq,
        app_name,
        segments,
    })
}

/// Flash an ESP-IDF project (all segments or app-only).
pub fn flash_idf_project(
    port_name: &str,
    build_dir: &str,
    app_only: bool,
    baud_rate: Option<u32>,
    progress: &mut MultiSegmentProgress,
) -> Result<(), String> {
    let project = parse_idf_flasher_args(build_dir)?;
    let build_path = Path::new(build_dir);

    // Determine which segments to flash
    let seg_infos: Vec<&FlashSegmentInfo> = if app_only {
        project
            .segments
            .iter()
            .filter(|s| s.name == "Application")
            .collect()
    } else {
        project.segments.iter().collect()
    };

    if seg_infos.is_empty() {
        return Err("No segments to flash".into());
    }

    // Read all segment data upfront and build espflash Segment structs
    let mut flash_segments: Vec<Segment<'_>> = Vec::new();
    for seg in &seg_infos {
        let offset = u32::from_str_radix(seg.offset.trim_start_matches("0x"), 16)
            .map_err(|e| format!("Invalid offset {}: {}", seg.offset, e))?;

        let file_path = build_path.join(&seg.file);
        let data = std::fs::read(&file_path)
            .map_err(|e| format!("Failed to read {}: {}", file_path.display(), e))?;

        if data.is_empty() {
            continue;
        }

        flash_segments.push(Segment {
            addr: offset,
            data: Cow::Owned(data),
        });
    }

    // Open flasher and write all segments in a single begin/finish cycle
    let mut flasher = open_flasher(port_name, baud_rate)?;

    let _ = progress.channel.send(FlashProgress {
        stage: "flashing".into(),
        current: 0,
        total: 0,
        percentage: 0.0,
        message: format!("Flashing {} segment(s)...", flash_segments.len()),
    });

    flasher
        .write_bins_to_flash(&flash_segments, progress)
        .map_err(|e| format!("Flash failed: {}", e))?;

    // Send final completion
    let _ = progress.channel.send(FlashProgress {
        stage: "done".into(),
        current: 0,
        total: 0,
        percentage: 100.0,
        message: if app_only {
            "App flashed successfully!".into()
        } else {
            format!("All {} segments flashed successfully!", seg_infos.len())
        },
    });

    Ok(())
}

/// Detect the connected ESP chip type.
pub fn detect_chip_info(port_name: &str) -> Result<ChipInfo, String> {
    let mut flasher = open_flasher(port_name, None)?;

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
