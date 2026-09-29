#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod discovery;
mod models;
mod settings;
mod state;
mod transfer;
mod util;

use crate::{
    discovery::start_discovery,
    models::{InitialState, Settings},
    settings::SettingsStore,
    state::{ReceiveDecision, SharedState},
    transfer::{bind_listener, clear_attention, send_paths, start_listener},
    util::random_hex,
};
use std::{io, path::PathBuf};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};

#[tauri::command]
fn get_state(state: State<'_, SharedState>) -> InitialState {
    let settings = state.settings_snapshot();
    InitialState {
        version: env!("CARGO_PKG_VERSION").to_string(),
        device_name: settings.device_name,
        device_id: settings.device_id,
        peers: state.peers_snapshot(),
        incoming: state.incoming_snapshot(),
    }
}

#[tauri::command]
fn set_device_name(
    name: String,
    app: AppHandle,
    state: State<'_, SharedState>,
) -> Result<Settings, String> {
    let updated = {
        let mut store = state
            .settings
            .lock()
            .map_err(|_| "配置状态异常".to_string())?;
        store.set_device_name(&name)?
    };
    let _ = app.emit("identity-updated", updated.clone());
    Ok(updated)
}

#[tauri::command]
fn choose_files() -> Vec<String> {
    rfd::FileDialog::new()
        .set_title("选择要发送的文件")
        .pick_files()
        .unwrap_or_default()
        .into_iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect()
}

#[tauri::command]
fn choose_folder() -> Vec<String> {
    rfd::FileDialog::new()
        .set_title("选择要发送的文件夹")
        .pick_folder()
        .into_iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect()
}

#[tauri::command]
fn send_selected_paths(
    peer_id: String,
    paths: Vec<String>,
    app: AppHandle,
    state: State<'_, SharedState>,
) -> Result<(), String> {
    let peer = state
        .peers_snapshot()
        .into_iter()
        .find(|peer| peer.id == peer_id)
        .ok_or_else(|| "目标电脑已离线，请重新选择".to_string())?;
    let paths = paths
        .into_iter()
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .collect::<Vec<_>>();
    if paths.is_empty() {
        return Err("请选择文件或文件夹".into());
    }
    send_paths(app, state.inner().clone(), peer, paths);
    Ok(())
}

#[tauri::command]
fn accept_incoming(
    transfer_id: String,
    app: AppHandle,
    state: State<'_, SharedState>,
) -> Result<Option<String>, String> {
    let Some(save_path) = rfd::FileDialog::new()
        .set_title("选择保存位置")
        .pick_folder()
    else {
        return Ok(None);
    };

    let record = {
        let pending = state
            .pending
            .lock()
            .map_err(|_| "接收状态异常".to_string())?;
        pending
            .get(&transfer_id)
            .cloned()
            .ok_or_else(|| "该接收请求已失效".to_string())?
    };

    let (lock, condvar) = &*record.decision;
    let mut decision = lock.lock().map_err(|_| "接收确认状态异常".to_string())?;
    if !matches!(*decision, ReceiveDecision::Pending) {
        return Err("该接收请求已经处理".into());
    }
    *decision = ReceiveDecision::Accepted(save_path.clone());
    condvar.notify_all();
    clear_attention(&app);
    Ok(Some(save_path.to_string_lossy().to_string()))
}

#[tauri::command]
fn reject_incoming(
    transfer_id: String,
    app: AppHandle,
    state: State<'_, SharedState>,
) -> Result<(), String> {
    let record = {
        let pending = state
            .pending
            .lock()
            .map_err(|_| "接收状态异常".to_string())?;
        pending
            .get(&transfer_id)
            .cloned()
            .ok_or_else(|| "该接收请求已失效".to_string())?
    };

    let (lock, condvar) = &*record.decision;
    let mut decision = lock.lock().map_err(|_| "接收确认状态异常".to_string())?;
    if !matches!(*decision, ReceiveDecision::Pending) {
        return Err("该接收请求已经处理".into());
    }
    *decision = ReceiveDecision::Rejected;
    condvar.notify_all();
    clear_attention(&app);
    Ok(())
}

#[tauri::command]
fn quit_app(app: AppHandle, state: State<'_, SharedState>) {
    state.stop();
    app.exit(0);
}

fn io_error(message: String) -> io::Error {
    io::Error::new(io::ErrorKind::Other, message)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Portable tools are often double-clicked more than once. Keep one receiver
            // process and bring its existing window forward instead of fighting for ports.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let listener = bind_listener().map_err(io_error)?;
            let tcp_port = listener.local_addr()?.port();
            let app_data = app.path().app_data_dir()?;
            let settings = SettingsStore::load(&app_data).map_err(io_error)?;
            let token = random_hex(32).map_err(io_error)?;
            let state = SharedState::new(settings, token, tcp_port);

            app.manage(state.clone());
            start_listener(listener, app.handle().clone(), state.clone());
            start_discovery(app.handle().clone(), state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_state,
            set_device_name,
            choose_files,
            choose_folder,
            send_selected_paths,
            accept_incoming,
            reject_incoming,
            quit_app
        ])
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                #[cfg(target_os = "macos")]
                {
                    let _ = window.hide();
                }
                #[cfg(not(target_os = "macos"))]
                {
                    let _ = window.minimize();
                }
            }
            WindowEvent::Focused(true) => {
                let _ = window.request_user_attention(None);
                let _ = window.set_title("汇云局域网跨传");
            }
            WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) => {
                let values = paths
                    .iter()
                    .map(|path| path.to_string_lossy().to_string())
                    .collect::<Vec<_>>();
                let _ = window.emit("files-dropped", values);
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("failed to run Huiyun LAN Transfer");
}
