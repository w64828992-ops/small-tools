use crate::{
    models::{Beacon, Peer},
    state::{PeerRecord, SharedState},
    util::{DISCOVERY_PORT, PROTOCOL_MAGIC},
};
use std::{
    net::UdpSocket,
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};

const BEACON_INTERVAL: Duration = Duration::from_millis(1600);
const PEER_TTL: Duration = Duration::from_secs(9);

pub fn start_discovery(app: AppHandle, state: SharedState) {
    thread::spawn(move || {
        if let Err(error) = discovery_loop(&app, &state) {
            let _ = app.emit("app-error", format!("局域网发现服务异常: {error}"));
        }
    });
}

fn discovery_loop(app: &AppHandle, state: &SharedState) -> Result<(), String> {
    let socket = UdpSocket::bind(("0.0.0.0", DISCOVERY_PORT))
        .map_err(|e| format!("无法监听 UDP {DISCOVERY_PORT}: {e}"))?;
    socket
        .set_broadcast(true)
        .map_err(|e| format!("无法启用局域网广播: {e}"))?;
    socket
        .set_read_timeout(Some(Duration::from_millis(350)))
        .map_err(|e| format!("无法配置发现服务: {e}"))?;

    let mut last_beacon = Instant::now() - BEACON_INTERVAL;
    let mut buffer = [0_u8; 4096];

    while !state.is_stopping() {
        if last_beacon.elapsed() >= BEACON_INTERVAL {
            let settings = state.settings_snapshot();
            let beacon = Beacon {
                magic: PROTOCOL_MAGIC.to_string(),
                id: settings.device_id,
                name: settings.device_name,
                port: state.tcp_port,
                token: state.token.clone(),
                platform: std::env::consts::OS.to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
            };
            if let Ok(data) = serde_json::to_vec(&beacon) {
                let _ = socket.send_to(&data, ("255.255.255.255", DISCOVERY_PORT));
            }
            last_beacon = Instant::now();
        }

        match socket.recv_from(&mut buffer) {
            Ok((size, source)) => {
                if size == 0 {
                    continue;
                }
                let Ok(beacon) = serde_json::from_slice::<Beacon>(&buffer[..size]) else {
                    continue;
                };
                let self_settings = state.settings_snapshot();
                if beacon.magic != PROTOCOL_MAGIC
                    || beacon.id == self_settings.device_id
                    || beacon.token.len() < 32
                    || beacon.name.trim().is_empty()
                    || beacon.port == 0
                {
                    continue;
                }

                let peer = Peer {
                    id: beacon.id,
                    name: beacon.name.chars().take(64).collect(),
                    address: source.ip().to_string(),
                    port: beacon.port,
                    token: beacon.token,
                    platform: beacon.platform,
                    version: beacon.version,
                };

                let mut changed = false;
                if let Ok(mut peers) = state.peers.lock() {
                    let should_emit = peers
                        .get(&peer.id)
                        .map(|existing| {
                            existing.peer.address != peer.address
                                || existing.peer.port != peer.port
                                || existing.peer.name != peer.name
                                || existing.peer.token != peer.token
                        })
                        .unwrap_or(true);
                    peers.insert(
                        peer.id.clone(),
                        PeerRecord {
                            peer,
                            last_seen: Instant::now(),
                        },
                    );
                    changed = should_emit;
                }
                if changed {
                    let _ = app.emit("peers-updated", state.peers_snapshot());
                }
            }
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) => {}
            Err(error) => return Err(error.to_string()),
        }

        let mut pruned = false;
        if let Ok(mut peers) = state.peers.lock() {
            let before = peers.len();
            peers.retain(|_, record| record.last_seen.elapsed() < PEER_TTL);
            pruned = before != peers.len();
        }
        if pruned {
            let _ = app.emit("peers-updated", state.peers_snapshot());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovery_constants_are_sane() {
        assert!(DISCOVERY_PORT > 1024);
        assert!(PEER_TTL > BEACON_INTERVAL * 3);
    }
}
