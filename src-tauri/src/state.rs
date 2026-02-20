use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

pub type LogSender = Arc<Mutex<Option<mpsc::Sender<String>>>>;

pub struct SerialConnection {
    pub port_name: String,
    pub baud_rate: u32,
    pub shutdown_tx: mpsc::Sender<()>,
    pub write_tx: mpsc::Sender<Vec<u8>>,
    pub log_tx: LogSender,
}

pub struct ConnectionManager {
    pub connections: Mutex<HashMap<String, SerialConnection>>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            connections: Mutex::new(HashMap::new()),
        }
    }
}
