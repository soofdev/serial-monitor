use crate::state::LogSender;
use serde::Serialize;
use serialport::{self, SerialPortInfo, SerialPortType};
use std::io::{Read, Write};
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::Emitter;
use tokio::sync::mpsc;

#[derive(Debug, Clone, Serialize)]
pub struct PortInfo {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SerialData {
    pub data: String,
    pub port: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SerialStatus {
    pub port: String,
    pub status: String,
    pub message: String,
}

pub fn list_available_ports() -> Vec<PortInfo> {
    serialport::available_ports()
        .unwrap_or_default()
        .into_iter()
        .map(|p: SerialPortInfo| {
            let description = match &p.port_type {
                SerialPortType::UsbPort(info) => {
                    let product = info.product.clone().unwrap_or_default();
                    let manufacturer = info.manufacturer.clone().unwrap_or_default();
                    if !product.is_empty() {
                        format!("{} ({})", product, manufacturer)
                    } else if !manufacturer.is_empty() {
                        manufacturer
                    } else {
                        "USB Serial".to_string()
                    }
                }
                SerialPortType::BluetoothPort => "Bluetooth".to_string(),
                SerialPortType::PciPort => "PCI".to_string(),
                SerialPortType::Unknown => "Unknown".to_string(),
            };
            PortInfo {
                name: p.port_name,
                description,
            }
        })
        .collect()
}

pub fn spawn_read_loop(
    port_name: String,
    baud_rate: u32,
    channel: Channel<SerialData>,
    app_handle: tauri::AppHandle,
    log_tx: LogSender,
) -> Result<(mpsc::Sender<()>, mpsc::Sender<Vec<u8>>), String> {
    let port = serialport::new(&port_name, baud_rate)
        .timeout(Duration::from_millis(100))
        .open()
        .map_err(|e| format!("Failed to open port {}: {}", port_name, e))?;

    let mut write_port = port
        .try_clone()
        .map_err(|e| format!("Failed to clone port: {}", e))?;

    let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);
    let (write_tx, mut write_rx) = mpsc::channel::<Vec<u8>>(256);

    let read_port_name = port_name.clone();

    // Spawn the blocking read loop
    tokio::task::spawn_blocking(move || {
        let mut port = port;
        let mut buf = [0u8; 4096];

        loop {
            // Check for shutdown signal (non-blocking)
            if shutdown_rx.try_recv().is_ok() {
                break;
            }

            match port.read(&mut buf) {
                Ok(n) if n > 0 => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();

                    // Forward to log if active
                    if let Ok(guard) = log_tx.lock() {
                        if let Some(tx) = guard.as_ref() {
                            let _ = tx.try_send(data.clone());
                        }
                    }

                    let _ = channel.send(SerialData {
                        data,
                        port: read_port_name.clone(),
                    });
                }
                Ok(_) => {}
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                    // Normal timeout, continue
                }
                Err(e) => {
                    // Port error — emit status event and break
                    let _ = app_handle.emit(
                        "serial-status",
                        SerialStatus {
                            port: read_port_name.clone(),
                            status: "disconnected".to_string(),
                            message: format!("Port error: {}", e),
                        },
                    );
                    break;
                }
            }
        }
    });

    // Spawn the write loop
    let write_port_name = port_name;
    tokio::spawn(async move {
        while let Some(data) = write_rx.recv().await {
            if let Err(e) = write_port.write_all(&data) {
                eprintln!("Write error on {}: {}", write_port_name, e);
                break;
            }
        }
    });

    Ok((shutdown_tx, write_tx))
}
