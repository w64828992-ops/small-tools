use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub device_id: String,
    pub device_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Beacon {
    pub magic: String,
    pub id: String,
    pub name: String,
    pub port: u16,
    pub token: String,
    pub platform: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Peer {
    pub id: String,
    pub name: String,
    pub address: String,
    pub port: u16,
    pub token: String,
    pub platform: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub rel_path: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemSummary {
    pub name: String,
    pub kind: String,
    pub size: u64,
    pub file_count: usize,
    pub dir_count: usize,
    pub skipped_symlinks: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub files: Vec<FileEntry>,
    pub dirs: Vec<String>,
    pub items: Vec<ItemSummary>,
    pub total_bytes: u64,
    pub file_count: usize,
    pub dir_count: usize,
    pub skipped_symlinks: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfferEnvelope {
    pub magic: String,
    pub token: String,
    pub transfer_id: String,
    pub sender_id: String,
    pub sender_name: String,
    pub manifest: Manifest,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomingOffer {
    pub id: String,
    pub sender_name: String,
    pub sender_address: String,
    pub status: String,
    pub total_bytes: u64,
    pub file_count: usize,
    pub dir_count: usize,
    pub skipped_symlinks: usize,
    pub received_bytes: u64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferProgress {
    pub id: String,
    pub direction: String,
    pub peer_name: String,
    pub status: String,
    pub total_bytes: u64,
    pub transferred_bytes: u64,
    pub bytes_per_second: f64,
    pub file_count: usize,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InitialState {
    pub version: String,
    pub device_name: String,
    pub device_id: String,
    pub peers: Vec<Peer>,
    pub incoming: Vec<IncomingOffer>,
}
