use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

const ARDUINO_CLI_VERSION: &str = "1.2.2";
const RELEASE_BASE: &str = "https://github.com/arduino/arduino-cli/releases/download";

/// Resolved path used when invoking arduino-cli. Prefers a PATH install
/// (so users who already have it via brew/scoop keep their version) and
/// falls back to the app-managed copy under <app data>/bin/.
async fn resolved_arduino_cli(app: &AppHandle) -> String {
    if path_arduino_cli_works().await {
        return "arduino-cli".to_string();
    }
    if let Some(local) = local_arduino_cli_path(app) {
        if local.exists() {
            return local.to_string_lossy().into_owned();
        }
    }
    "arduino-cli".to_string()
}

async fn path_arduino_cli_works() -> bool {
    matches!(
        Command::new("arduino-cli")
            .args(["version", "--format", "json"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .await,
        Ok(s) if s.success()
    )
}

fn local_arduino_cli_path(app: &AppHandle) -> Option<PathBuf> {
    let data_dir = app.path().app_data_dir().ok()?;
    let bin = if cfg!(windows) { "arduino-cli.exe" } else { "arduino-cli" };
    Some(data_dir.join("bin").join(bin))
}

#[derive(Serialize, Default)]
pub struct ArduinoCliStatus {
    pub available: bool,
    pub version: Option<String>,
    pub esp32_core_installed: bool,
    pub esp32_core_version: Option<String>,
    pub error: Option<String>,
}

#[derive(Deserialize)]
struct VersionJson {
    #[serde(rename = "VersionString")]
    version_string: Option<String>,
}

#[derive(Deserialize)]
struct CoreListJson {
    platforms: Option<Vec<CorePlatform>>,
}

#[derive(Deserialize)]
struct CorePlatform {
    id: String,
    installed_version: Option<String>,
}

pub async fn detect_arduino_cli(app: AppHandle) -> ArduinoCliStatus {
    let cli = resolved_arduino_cli(&app).await;
    let version_out = match Command::new(&cli)
        .args(["version", "--format", "json"])
        .output()
        .await
    {
        Ok(o) if o.status.success() => o,
        Ok(o) => {
            return ArduinoCliStatus {
                error: Some(format!(
                    "arduino-cli exited {}: {}",
                    o.status,
                    String::from_utf8_lossy(&o.stderr).trim()
                )),
                ..Default::default()
            };
        }
        Err(e) => {
            return ArduinoCliStatus {
                error: Some(format!("arduino-cli not found: {}", e)),
                ..Default::default()
            };
        }
    };

    let version = serde_json::from_slice::<VersionJson>(&version_out.stdout)
        .ok()
        .and_then(|v| v.version_string);

    let (esp32_installed, esp32_version) = match Command::new(&cli)
        .args(["core", "list", "--format", "json"])
        .output()
        .await
    {
        Ok(o) if o.status.success() => {
            match serde_json::from_slice::<CoreListJson>(&o.stdout) {
                Ok(parsed) => parsed
                    .platforms
                    .unwrap_or_default()
                    .into_iter()
                    .find(|p| p.id == "esp32:esp32")
                    .map(|p| (true, p.installed_version))
                    .unwrap_or((false, None)),
                Err(_) => (false, None),
            }
        }
        _ => (false, None),
    };

    ArduinoCliStatus {
        available: true,
        version,
        esp32_core_installed: esp32_installed,
        esp32_core_version: esp32_version,
        error: None,
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "lowercase")]
pub enum LogStream {
    Stdout,
    Stderr,
}

#[derive(Serialize, Clone)]
pub struct CompileLog {
    pub stream: LogStream,
    pub line: String,
}

#[derive(Serialize)]
pub struct CompileResult {
    pub ok: bool,
    pub binary_path: Option<String>,
    pub sketch_dir: Option<String>,
    pub exit_code: Option<i32>,
}

pub async fn compile_sketch(
    app: AppHandle,
    source: String,
    fqbn: String,
    on_log: Channel<CompileLog>,
) -> Result<CompileResult, String> {
    let cli = resolved_arduino_cli(&app).await;
    if source.trim().is_empty() {
        return Err("Sketch source is empty".into());
    }
    if fqbn.trim().is_empty() {
        return Err("FQBN is empty".into());
    }

    // <temp>/sm_<ts>/sketch/sketch.ino — sketch.ino's stem must match its parent dir name.
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let root: PathBuf = std::env::temp_dir().join(format!("sm_compile_{}", ts));
    let sketch_dir = root.join("sketch");
    let output_dir = root.join("build");

    tokio::fs::create_dir_all(&sketch_dir)
        .await
        .map_err(|e| format!("Failed to create sketch dir: {}", e))?;
    tokio::fs::create_dir_all(&output_dir)
        .await
        .map_err(|e| format!("Failed to create build dir: {}", e))?;

    let sketch_file = sketch_dir.join("sketch.ino");
    tokio::fs::write(&sketch_file, source)
        .await
        .map_err(|e| format!("Failed to write sketch.ino: {}", e))?;

    let _ = on_log.send(CompileLog {
        stream: LogStream::Stdout,
        line: format!(
            "$ {} compile --fqbn {} --output-dir {} {}",
            cli,
            fqbn,
            output_dir.display(),
            sketch_dir.display()
        ),
    });

    let mut child = Command::new(&cli)
        .args([
            "compile",
            "--fqbn",
            &fqbn,
            "--output-dir",
            &output_dir.to_string_lossy(),
            "--no-color",
            "--verbose",
            &sketch_dir.to_string_lossy(),
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn arduino-cli: {}", e))?;

    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");

    let log_out = on_log.clone();
    let stdout_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = log_out.send(CompileLog {
                stream: LogStream::Stdout,
                line,
            });
        }
    });

    let log_err = on_log.clone();
    let stderr_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = log_err.send(CompileLog {
                stream: LogStream::Stderr,
                line,
            });
        }
    });

    let status = child
        .wait()
        .await
        .map_err(|e| format!("arduino-cli wait failed: {}", e))?;
    let _ = stdout_task.await;
    let _ = stderr_task.await;

    let exit_code = status.code();
    let ok = status.success();

    let binary_path = if ok {
        find_flash_binary(&output_dir).await
    } else {
        None
    };

    if let Some(ref bin) = binary_path {
        let _ = on_log.send(CompileLog {
            stream: LogStream::Stdout,
            line: format!("Binary: {}", bin),
        });
    } else if ok {
        let _ = on_log.send(CompileLog {
            stream: LogStream::Stderr,
            line: format!(
                "Compile reported success but no .bin found in {}",
                output_dir.display()
            ),
        });
    }

    Ok(CompileResult {
        ok: ok && binary_path.is_some(),
        binary_path,
        sketch_dir: Some(root.to_string_lossy().into_owned()),
        exit_code,
    })
}

#[derive(Serialize, Clone)]
#[serde(tag = "stage", rename_all = "snake_case")]
pub enum InstallProgress {
    Starting { url: String, asset: String },
    Downloading { current: u64, total: u64 },
    Extracting,
    Verifying,
    Done { path: String, version: Option<String> },
    Error { message: String },
}

#[derive(Serialize)]
pub struct InstallResult {
    pub ok: bool,
    pub path: Option<String>,
    pub error: Option<String>,
}

pub async fn install_arduino_cli(
    app: AppHandle,
    on_progress: Channel<InstallProgress>,
) -> Result<InstallResult, String> {
    let asset = asset_name().ok_or_else(|| "Unsupported OS/arch".to_string())?;
    let url = format!("{}/v{}/{}", RELEASE_BASE, ARDUINO_CLI_VERSION, asset);
    let _ = on_progress.send(InstallProgress::Starting {
        url: url.clone(),
        asset: asset.clone(),
    });

    let install_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("No app data dir: {}", e))?
        .join("bin");
    tokio::fs::create_dir_all(&install_dir)
        .await
        .map_err(|e| format!("Create bin dir failed: {}", e))?;

    let temp_archive = std::env::temp_dir().join(format!(
        "sm_arduino_cli_{}_{}",
        ARDUINO_CLI_VERSION, &asset
    ));

    if let Err(e) = download_with_progress(&url, &temp_archive, &on_progress).await {
        let _ = on_progress.send(InstallProgress::Error { message: e.clone() });
        return Err(e);
    }

    let _ = on_progress.send(InstallProgress::Extracting);
    let bin_path = match extract_arduino_cli(&temp_archive, &install_dir, &asset).await {
        Ok(p) => p,
        Err(e) => {
            let _ = on_progress.send(InstallProgress::Error { message: e.clone() });
            return Err(e);
        }
    };

    let _ = tokio::fs::remove_file(&temp_archive).await;

    let _ = on_progress.send(InstallProgress::Verifying);
    let version = match Command::new(&bin_path)
        .args(["version", "--format", "json"])
        .output()
        .await
    {
        Ok(o) if o.status.success() => serde_json::from_slice::<VersionJson>(&o.stdout)
            .ok()
            .and_then(|v| v.version_string),
        Ok(o) => {
            let msg = format!(
                "Installed but verification failed: exit {} — {}",
                o.status,
                String::from_utf8_lossy(&o.stderr).trim()
            );
            let _ = on_progress.send(InstallProgress::Error { message: msg.clone() });
            return Err(msg);
        }
        Err(e) => {
            let msg = format!("Installed but cannot execute: {}", e);
            let _ = on_progress.send(InstallProgress::Error { message: msg.clone() });
            return Err(msg);
        }
    };

    let path_str = bin_path.to_string_lossy().into_owned();
    let _ = on_progress.send(InstallProgress::Done {
        path: path_str.clone(),
        version: version.clone(),
    });

    Ok(InstallResult {
        ok: true,
        path: Some(path_str),
        error: None,
    })
}

fn asset_name() -> Option<String> {
    let v = ARDUINO_CLI_VERSION;
    let (os, arch, ext) = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "x86_64") => ("macOS", "64bit", "tar.gz"),
        ("macos", "aarch64") => ("macOS", "ARM64", "tar.gz"),
        ("linux", "x86_64") => ("Linux", "64bit", "tar.gz"),
        ("linux", "aarch64") => ("Linux", "ARM64", "tar.gz"),
        ("linux", "arm") => ("Linux", "ARMv7", "tar.gz"),
        ("windows", "x86_64") => ("Windows", "64bit", "zip"),
        ("windows", "x86") => ("Windows", "32bit", "zip"),
        _ => return None,
    };
    Some(format!("arduino-cli_{}_{}_{}.{}", v, os, arch, ext))
}

async fn download_with_progress(
    url: &str,
    dest: &Path,
    on_progress: &Channel<InstallProgress>,
) -> Result<(), String> {
    let response = reqwest::get(url)
        .await
        .map_err(|e| format!("Download request failed: {}", e))?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}: {}", response.status(), url));
    }
    let total = response.content_length().unwrap_or(0);
    let mut file = tokio::fs::File::create(dest)
        .await
        .map_err(|e| format!("Create temp file failed: {}", e))?;
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last_report: u64 = 0;
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| format!("Download chunk failed: {}", e))?;
        file.write_all(&bytes)
            .await
            .map_err(|e| format!("Write failed: {}", e))?;
        downloaded += bytes.len() as u64;
        // Throttle progress events to ~every 256 KB or at the end.
        if downloaded - last_report >= 256 * 1024 || (total > 0 && downloaded >= total) {
            last_report = downloaded;
            let _ = on_progress.send(InstallProgress::Downloading {
                current: downloaded,
                total,
            });
        }
    }
    file.flush()
        .await
        .map_err(|e| format!("Flush failed: {}", e))?;
    Ok(())
}

async fn extract_arduino_cli(
    archive: &Path,
    install_dir: &Path,
    asset: &str,
) -> Result<PathBuf, String> {
    let archive = archive.to_owned();
    let install_dir = install_dir.to_owned();
    let is_zip = asset.ends_with(".zip");

    tokio::task::spawn_blocking(move || -> Result<PathBuf, String> {
        let bin_name = if is_zip { "arduino-cli.exe" } else { "arduino-cli" };
        let dest = install_dir.join(bin_name);
        if is_zip {
            extract_zip(&archive, &dest, bin_name)?;
        } else {
            extract_tar_gz(&archive, &dest, bin_name)?;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&dest).map_err(|e| e.to_string())?.permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&dest, perms).map_err(|e| e.to_string())?;
        }
        Ok(dest)
    })
    .await
    .map_err(|e| format!("Extract task panicked: {}", e))?
}

fn extract_tar_gz(archive: &Path, dest: &Path, bin_name: &str) -> Result<(), String> {
    let file = std::fs::File::open(archive).map_err(|e| format!("Open archive: {}", e))?;
    let gz = flate2::read::GzDecoder::new(file);
    let mut tar = tar::Archive::new(gz);
    for entry in tar.entries().map_err(|e| format!("Read tar: {}", e))? {
        let mut entry = entry.map_err(|e| format!("Tar entry: {}", e))?;
        let path = entry.path().map_err(|e| format!("Tar path: {}", e))?;
        if path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n == bin_name)
            .unwrap_or(false)
        {
            entry
                .unpack(dest)
                .map_err(|e| format!("Unpack failed: {}", e))?;
            return Ok(());
        }
    }
    Err(format!("'{}' not found in tar.gz", bin_name))
}

fn extract_zip(archive: &Path, dest: &Path, bin_name: &str) -> Result<(), String> {
    let file = std::fs::File::open(archive).map_err(|e| format!("Open archive: {}", e))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("Read zip: {}", e))?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| format!("Zip index: {}", e))?;
        let name = entry.name().to_string();
        let leaf = std::path::Path::new(&name)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        if leaf == bin_name {
            let mut out =
                std::fs::File::create(dest).map_err(|e| format!("Create dest: {}", e))?;
            std::io::copy(&mut entry, &mut out).map_err(|e| format!("Copy: {}", e))?;
            return Ok(());
        }
    }
    Err(format!("'{}' not found in zip", bin_name))
}

pub async fn install_esp32_core(
    app: AppHandle,
    on_log: Channel<CompileLog>,
) -> Result<(), String> {
    let cli = resolved_arduino_cli(&app).await;
    run_streaming_cli(&cli, &["core", "update-index", "--no-color"], &on_log).await?;
    run_streaming_cli(
        &cli,
        &["core", "install", "esp32:esp32", "--no-color"],
        &on_log,
    )
    .await?;
    Ok(())
}

async fn run_streaming_cli(
    cli: &str,
    args: &[&str],
    on_log: &Channel<CompileLog>,
) -> Result<(), String> {
    let _ = on_log.send(CompileLog {
        stream: LogStream::Stdout,
        line: format!("$ {} {}", cli, args.join(" ")),
    });

    let mut child = Command::new(cli)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn {}: {}", cli, e))?;

    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");

    let log_out = on_log.clone();
    let stdout_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = log_out.send(CompileLog {
                stream: LogStream::Stdout,
                line,
            });
        }
    });
    let log_err = on_log.clone();
    let stderr_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = log_err.send(CompileLog {
                stream: LogStream::Stderr,
                line,
            });
        }
    });

    let status = child
        .wait()
        .await
        .map_err(|e| format!("wait failed: {}", e))?;
    let _ = stdout_task.await;
    let _ = stderr_task.await;

    if !status.success() {
        return Err(format!("exited with status {:?}", status.code()));
    }
    Ok(())
}

pub async fn upload_sketch(
    app: AppHandle,
    port: String,
    fqbn: String,
    sketch_root: String,
    on_log: Channel<CompileLog>,
) -> Result<(), String> {
    if port.trim().is_empty() {
        return Err("Port is empty".into());
    }
    let cli = resolved_arduino_cli(&app).await;
    let sketch_dir = format!("{}/sketch", sketch_root);
    let build_dir = format!("{}/build", sketch_root);

    let _ = on_log.send(CompileLog {
        stream: LogStream::Stdout,
        line: format!(
            "$ {} upload --fqbn {} --port {} --input-dir {} {}",
            cli, fqbn, port, build_dir, sketch_dir
        ),
    });

    let mut child = Command::new(&cli)
        .args([
            "upload",
            "--fqbn",
            &fqbn,
            "--port",
            &port,
            "--input-dir",
            &build_dir,
            "--no-color",
            "--verbose",
            &sketch_dir,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn arduino-cli upload: {}", e))?;

    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");

    let log_out = on_log.clone();
    let stdout_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = log_out.send(CompileLog {
                stream: LogStream::Stdout,
                line,
            });
        }
    });
    let log_err = on_log.clone();
    let stderr_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = log_err.send(CompileLog {
                stream: LogStream::Stderr,
                line,
            });
        }
    });

    let status = child
        .wait()
        .await
        .map_err(|e| format!("arduino-cli upload wait failed: {}", e))?;
    let _ = stdout_task.await;
    let _ = stderr_task.await;

    if !status.success() {
        return Err(format!(
            "arduino-cli upload exited with status {:?}",
            status.code()
        ));
    }
    Ok(())
}

/// Pick the binary best suited for a flat 0x0 flash. Prefers `*.merged.bin`
/// (ESP32-style single-image output), falls back to `*.ino.bin`.
async fn find_flash_binary(dir: &PathBuf) -> Option<String> {
    let mut merged: Option<PathBuf> = None;
    let mut app: Option<PathBuf> = None;
    let mut entries = tokio::fs::read_dir(dir).await.ok()?;
    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_owned(),
            None => continue,
        };
        if name.ends_with(".merged.bin") {
            merged = Some(path);
        } else if name.ends_with(".ino.bin") && app.is_none() {
            app = Some(path);
        }
    }
    merged
        .or(app)
        .map(|p| p.to_string_lossy().into_owned())
}
