mod commands;
mod flash;
mod serial;
mod state;

use state::ConnectionManager;
use std::sync::Arc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let manager = Arc::new(ConnectionManager::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(manager)
        .invoke_handler(tauri::generate_handler![
            commands::list_ports,
            commands::connect,
            commands::disconnect,
            commands::send,
            commands::start_log,
            commands::stop_log,
            commands::flash_firmware,
            commands::parse_idf_project,
            commands::flash_idf_project,
            commands::detect_chip,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
