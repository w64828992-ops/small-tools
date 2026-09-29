use crate::{
    models::{IncomingOffer, Peer, Settings},
    settings::SettingsStore,
};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Condvar, Mutex,
    },
    time::Instant,
};

#[derive(Clone)]
pub struct PeerRecord {
    pub peer: Peer,
    pub last_seen: Instant,
}

#[derive(Debug, Clone)]
pub enum ReceiveDecision {
    Pending,
    Accepted(PathBuf),
    Rejected,
}

#[derive(Clone)]
pub struct PendingRecord {
    pub offer: IncomingOffer,
    pub decision: Arc<(Mutex<ReceiveDecision>, Condvar)>,
}

#[derive(Clone)]
pub struct SharedState {
    pub settings: Arc<Mutex<SettingsStore>>,
    pub peers: Arc<Mutex<HashMap<String, PeerRecord>>>,
    pub pending: Arc<Mutex<HashMap<String, PendingRecord>>>,
    pub token: String,
    pub tcp_port: u16,
    pub shutdown: Arc<AtomicBool>,
}

impl SharedState {
    pub fn new(settings: SettingsStore, token: String, tcp_port: u16) -> Self {
        Self {
            settings: Arc::new(Mutex::new(settings)),
            peers: Arc::new(Mutex::new(HashMap::new())),
            pending: Arc::new(Mutex::new(HashMap::new())),
            token,
            tcp_port,
            shutdown: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn settings_snapshot(&self) -> Settings {
        self.settings
            .lock()
            .map(|store| store.get())
            .unwrap_or(Settings {
                device_id: "unknown".into(),
                device_name: "我的电脑".into(),
            })
    }

    pub fn peers_snapshot(&self) -> Vec<Peer> {
        let mut peers = self
            .peers
            .lock()
            .map(|map| {
                map.values()
                    .map(|record| record.peer.clone())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        peers.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.address.cmp(&b.address)));
        peers
    }

    pub fn incoming_snapshot(&self) -> Vec<IncomingOffer> {
        let mut offers = self
            .pending
            .lock()
            .map(|map| {
                map.values()
                    .map(|record| record.offer.clone())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        offers.sort_by(|a, b| a.id.cmp(&b.id));
        offers
    }

    pub fn stop(&self) {
        self.shutdown.store(true, Ordering::SeqCst);
    }

    pub fn is_stopping(&self) -> bool {
        self.shutdown.load(Ordering::SeqCst)
    }
}
