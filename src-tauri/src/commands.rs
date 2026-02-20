use crate::serial::{self, PortInfo, SerialData};
use crate::state::{ConnectionManager, SerialConnection};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;
use tauri::State;

#[tauri::command]
pub fn list_ports() -> Vec<PortInfo> {
    serial::list_available_ports()
}

#[tauri::command]
pub async fn connect(
    port: String,
    baud_rate: u32,
    on_data: Channel<SerialData>,
    manager: State<'_, Arc<ConnectionManager>>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // Check if already connected
    {
        let conns = manager.connections.lock().map_err(|e| e.to_string())?;
        if conns.contains_key(&port) {
            return Err(format!("Already connected to {}", port));
        }
    }

    let log_tx = Arc::new(Mutex::new(None));

    let (shutdown_tx, write_tx) =
        serial::spawn_read_loop(port.clone(), baud_rate, on_data, app_handle, log_tx.clone())?;

    let conn = SerialConnection {
        port_name: port.clone(),
        baud_rate,
        shutdown_tx,
        write_tx,
        log_tx,
    };

    let mut conns = manager.connections.lock().map_err(|e| e.to_string())?;
    conns.insert(port, conn);

    Ok(())
}

#[tauri::command]
pub fn disconnect(port: String, manager: State<'_, Arc<ConnectionManager>>) -> Result<(), String> {
    let mut conns = manager.connections.lock().map_err(|e| e.to_string())?;
    if let Some(conn) = conns.remove(&port) {
        // Signal shutdown — the read loop will exit
        let _ = conn.shutdown_tx.try_send(());
        // Drop write_tx and log_tx to close their loops
        drop(conn);
        Ok(())
    } else {
        Err(format!("Not connected to {}", port))
    }
}

#[tauri::command]
pub async fn send(
    port: String,
    data: String,
    line_ending: String,
    manager: State<'_, Arc<ConnectionManager>>,
) -> Result<(), String> {
    let suffix = match line_ending.as_str() {
        "\\n" | "lf" => "\n",
        "\\r" | "cr" => "\r",
        "\\r\\n" | "crlf" => "\r\n",
        _ => "",
    };

    let payload = format!("{}{}", data, suffix);

    let write_tx = {
        let conns = manager.connections.lock().map_err(|e| e.to_string())?;
        let conn = conns
            .get(&port)
            .ok_or_else(|| format!("Not connected to {}", port))?;
        conn.write_tx.clone()
    };

    write_tx
        .send(payload.into_bytes())
        .await
        .map_err(|e| format!("Send failed: {}", e))
}

#[tauri::command]
pub async fn start_log(
    port: String,
    file_path: String,
    manager: State<'_, Arc<ConnectionManager>>,
) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;

    let (sender, mut log_rx) = tokio::sync::mpsc::channel::<String>(1024);

    // Store the log sender in the connection's shared log_tx
    {
        let conns = manager.connections.lock().map_err(|e| e.to_string())?;
        let conn = conns
            .get(&port)
            .ok_or_else(|| format!("Not connected to {}", port))?;
        let mut guard = conn.log_tx.lock().map_err(|e| e.to_string())?;
        *guard = Some(sender);
    }

    // Spawn a task to write log data to file
    tokio::spawn(async move {
        let file = tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&file_path)
            .await;

        match file {
            Ok(mut f) => {
                while let Some(line) = log_rx.recv().await {
                    if let Err(e) = f.write_all(line.as_bytes()).await {
                        eprintln!("Log write error: {}", e);
                        break;
                    }
                }
            }
            Err(e) => {
                eprintln!("Failed to open log file {}: {}", file_path, e);
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn stop_log(port: String, manager: State<'_, Arc<ConnectionManager>>) -> Result<(), String> {
    let conns = manager.connections.lock().map_err(|e| e.to_string())?;
    let conn = conns
        .get(&port)
        .ok_or_else(|| format!("Not connected to {}", port))?;
    let mut guard = conn.log_tx.lock().map_err(|e| e.to_string())?;
    *guard = None; // Dropping the sender closes the channel and the file task
    Ok(())
}
