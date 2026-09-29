use crate::{
    models::{
        FileEntry, IncomingOffer, ItemSummary, Manifest, OfferEnvelope, Peer, TransferProgress,
    },
    state::{PendingRecord, ReceiveDecision, SharedState},
    util::{
        copy_exact, is_lan_ip, normalize_relative, read_json_frame, safe_join,
        unique_top_level_name, validate_current_platform_path, write_json_frame, OFFER_TTL_SECS,
        PROTOCOL_MAGIC,
    },
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File},
    io::{self, Read, Write},
    net::{TcpListener, TcpStream, ToSocketAddrs},
    path::{Path, PathBuf},
    sync::{Arc, Condvar, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager, UserAttentionType};

const MAX_MANIFEST_FILES: usize = 100_000;
const MAX_PATH_BYTES: usize = 4096;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProtocolReply {
    status: String,
    message: Option<String>,
}

#[derive(Debug)]
struct LocalFile {
    abs_path: PathBuf,
    rel_path: String,
    size: u64,
}

#[derive(Debug)]
struct ScanResult {
    manifest: Manifest,
    files: Vec<LocalFile>,
}

pub fn bind_listener() -> Result<TcpListener, String> {
    let listener =
        TcpListener::bind(("0.0.0.0", 0)).map_err(|e| format!("无法启动文件接收服务: {e}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("无法配置接收服务: {e}"))?;
    Ok(listener)
}

pub fn start_listener(listener: TcpListener, app: AppHandle, state: SharedState) {
    thread::spawn(move || {
        while !state.is_stopping() {
            match listener.accept() {
                Ok((stream, address)) => {
                    if !is_lan_ip(address.ip()) {
                        continue;
                    }
                    let app = app.clone();
                    let state = state.clone();
                    thread::spawn(move || {
                        if let Err(error) =
                            handle_connection(stream, address.ip().to_string(), &app, &state)
                        {
                            let _ = app.emit("app-error", format!("接收连接异常: {error}"));
                        }
                    });
                }
                Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(100));
                }
                Err(error) => {
                    let _ = app.emit("app-error", format!("文件接收服务异常: {error}"));
                    thread::sleep(Duration::from_millis(500));
                }
            }
        }
    });
}

fn handle_connection(
    mut stream: TcpStream,
    sender_address: String,
    app: &AppHandle,
    state: &SharedState,
) -> Result<(), String> {
    let _ = stream.set_nodelay(true);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(30)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(30)));

    let envelope: OfferEnvelope =
        read_json_frame(&mut stream).map_err(|e| format!("无法读取传输请求: {e}"))?;
    validate_offer(&envelope, state)?;

    let offer = IncomingOffer {
        id: envelope.transfer_id.clone(),
        sender_name: envelope.sender_name.chars().take(64).collect(),
        sender_address,
        status: "pending".into(),
        total_bytes: envelope.manifest.total_bytes,
        file_count: envelope.manifest.file_count,
        dir_count: envelope.manifest.dir_count,
        skipped_symlinks: envelope.manifest.skipped_symlinks,
        received_bytes: 0,
        error: None,
    };
    let decision = Arc::new((Mutex::new(ReceiveDecision::Pending), Condvar::new()));
    {
        let mut pending = state
            .pending
            .lock()
            .map_err(|_| "接收状态锁异常".to_string())?;
        if pending.contains_key(&offer.id) {
            return Err("重复的传输请求".into());
        }
        pending.insert(
            offer.id.clone(),
            PendingRecord {
                offer: offer.clone(),
                decision: decision.clone(),
            },
        );
    }

    attention(app, &offer.sender_name);
    let _ = app.emit("incoming-offer", offer.clone());

    let accepted_path = match wait_for_decision(&decision) {
        Ok(value) => value,
        Err(error) => {
            let status = if error.contains("超时") {
                "expired"
            } else {
                "error"
            };
            update_offer(state, app, &offer.id, status, None, Some(error.clone()));
            clear_attention(app);
            let _ = write_json_frame(
                &mut stream,
                &ProtocolReply {
                    status: status.into(),
                    message: Some(error),
                },
            );
            return Ok(());
        }
    };
    let Some(save_base) = accepted_path else {
        update_offer(state, app, &offer.id, "rejected", None, None);
        clear_attention(app);
        let _ = write_json_frame(
            &mut stream,
            &ProtocolReply {
                status: "rejected".into(),
                message: Some("对方已拒绝接收".into()),
            },
        );
        return Ok(());
    };

    let root_map = match prepare_destination(&save_base, &envelope.manifest) {
        Ok(map) => map,
        Err(error) => {
            update_offer(state, app, &offer.id, "error", None, Some(error.clone()));
            clear_attention(app);
            let _ = write_json_frame(
                &mut stream,
                &ProtocolReply {
                    status: "error".into(),
                    message: Some(error),
                },
            );
            return Ok(());
        }
    };
    update_offer(state, app, &offer.id, "accepted", None, None);
    clear_attention(app);

    write_json_frame(
        &mut stream,
        &ProtocolReply {
            status: "accepted".into(),
            message: None,
        },
    )
    .map_err(|e| format!("无法回复接收确认: {e}"))?;

    let _ = stream.set_read_timeout(Some(Duration::from_secs(120)));
    let result = receive_files(
        &mut stream,
        &save_base,
        &root_map,
        &envelope.manifest,
        &offer.id,
        &offer.sender_name,
        app,
        state,
    );

    match result {
        Ok(()) => {
            update_offer(
                state,
                app,
                &offer.id,
                "completed",
                Some(envelope.manifest.total_bytes),
                None,
            );
            let _ = write_json_frame(
                &mut stream,
                &ProtocolReply {
                    status: "completed".into(),
                    message: None,
                },
            );
            Ok(())
        }
        Err(error) => {
            update_offer(state, app, &offer.id, "error", None, Some(error.clone()));
            let _ = write_json_frame(
                &mut stream,
                &ProtocolReply {
                    status: "error".into(),
                    message: Some(error.clone()),
                },
            );
            Err(error)
        }
    }
}

fn validate_offer(envelope: &OfferEnvelope, state: &SharedState) -> Result<(), String> {
    if envelope.magic != PROTOCOL_MAGIC {
        return Err("协议版本不匹配".into());
    }
    if !constant_time_eq(envelope.token.as_bytes(), state.token.as_bytes()) {
        return Err("无效的局域网会话凭证".into());
    }
    if envelope.transfer_id.len() < 16 || envelope.transfer_id.len() > 96 {
        return Err("无效传输编号".into());
    }
    if envelope.sender_name.trim().is_empty() {
        return Err("发送方名称无效".into());
    }
    validate_manifest(&envelope.manifest)
}

fn validate_manifest(manifest: &Manifest) -> Result<(), String> {
    if manifest.files.len() > MAX_MANIFEST_FILES {
        return Err("文件数量超过上限".into());
    }
    if manifest.files.len() != manifest.file_count || manifest.dirs.len() != manifest.dir_count {
        return Err("文件清单统计不一致".into());
    }
    let mut files = HashSet::new();
    let mut total = 0_u64;
    for file in &manifest.files {
        let path = normalize_relative(&file.rel_path)?;
        if !files.insert(path) {
            return Err("文件清单包含重复路径".into());
        }
        total = total
            .checked_add(file.size)
            .ok_or_else(|| "文件总大小溢出".to_string())?;
    }
    if total != manifest.total_bytes {
        return Err("文件清单总大小不一致".into());
    }
    let mut dirs = HashSet::new();
    for dir in &manifest.dirs {
        dirs.insert(normalize_relative(dir)?);
    }
    if manifest.files.is_empty() && manifest.dirs.is_empty() {
        return Err("不能发送空清单".into());
    }
    Ok(())
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right)
        .fold(0_u8, |acc, (a, b)| acc | (a ^ b))
        == 0
}

fn wait_for_decision(
    pair: &Arc<(Mutex<ReceiveDecision>, Condvar)>,
) -> Result<Option<PathBuf>, String> {
    let (lock, condvar) = &**pair;
    let guard = lock.lock().map_err(|_| "接收确认状态异常".to_string())?;
    let (guard, timeout) = condvar
        .wait_timeout_while(guard, Duration::from_secs(OFFER_TTL_SECS), |decision| {
            matches!(decision, ReceiveDecision::Pending)
        })
        .map_err(|_| "接收确认等待失败".to_string())?;

    if timeout.timed_out() && matches!(*guard, ReceiveDecision::Pending) {
        return Err("接收请求等待超时".into());
    }
    match &*guard {
        ReceiveDecision::Accepted(path) => Ok(Some(path.clone())),
        ReceiveDecision::Rejected => Ok(None),
        ReceiveDecision::Pending => Err("接收请求未处理".into()),
    }
}

fn prepare_destination(
    base: &Path,
    manifest: &Manifest,
) -> Result<HashMap<String, String>, String> {
    if !base.exists() || !base.is_dir() {
        return Err("保存位置无效".into());
    }

    for dir in &manifest.dirs {
        validate_current_platform_path(dir)?;
    }
    for file in &manifest.files {
        validate_current_platform_path(&file.rel_path)?;
    }

    let dir_roots: HashSet<String> = manifest
        .dirs
        .iter()
        .filter_map(|value| value.split('/').next().map(str::to_string))
        .collect();
    let mut roots = Vec::<String>::new();
    let mut seen = HashSet::<String>::new();
    for dir in &manifest.dirs {
        if let Some(root) = dir.split('/').next() {
            if seen.insert(root.to_string()) {
                roots.push(root.to_string());
            }
        }
    }
    for file in &manifest.files {
        if let Some(root) = file.rel_path.split('/').next() {
            if seen.insert(root.to_string()) {
                roots.push(root.to_string());
            }
        }
    }

    let mut reserved = HashSet::new();
    let mut root_map = HashMap::new();
    for root in roots {
        let mapped = unique_top_level_name(base, &root, dir_roots.contains(&root), &mut reserved)?;
        root_map.insert(root, mapped);
    }

    let mut dirs = manifest.dirs.clone();
    dirs.sort_by_key(|value| value.matches('/').count());
    for dir in dirs {
        let mapped = map_relative(&dir, &root_map)?;
        let target = safe_join(base, &mapped)?;
        fs::create_dir_all(&target)
            .map_err(|e| format!("无法创建接收文件夹 {}: {e}", target.display()))?;
    }
    Ok(root_map)
}

fn map_relative(relative: &str, root_map: &HashMap<String, String>) -> Result<String, String> {
    let normalized = normalize_relative(relative)?;
    let mut parts = normalized.split('/');
    let root = parts.next().ok_or_else(|| "路径缺少顶层名称".to_string())?;
    let mapped = root_map
        .get(root)
        .ok_or_else(|| "找不到顶层目标目录".to_string())?;
    let rest = parts.collect::<Vec<_>>();
    if rest.is_empty() {
        Ok(mapped.clone())
    } else {
        Ok(format!("{mapped}/{}", rest.join("/")))
    }
}

fn receive_files(
    stream: &mut TcpStream,
    save_base: &Path,
    root_map: &HashMap<String, String>,
    manifest: &Manifest,
    transfer_id: &str,
    sender_name: &str,
    app: &AppHandle,
    state: &SharedState,
) -> Result<(), String> {
    let expected: HashMap<String, u64> = manifest
        .files
        .iter()
        .map(|entry| (entry.rel_path.clone(), entry.size))
        .collect();
    let mut received = HashSet::new();
    let mut total_received = 0_u64;
    let started = Instant::now();
    let mut last_emit = Instant::now() - Duration::from_secs(1);

    loop {
        let path_len = read_u32(stream).map_err(|e| format!("读取文件帧失败: {e}"))? as usize;
        if path_len == 0 {
            break;
        }
        if path_len > MAX_PATH_BYTES {
            return Err("文件路径过长".into());
        }

        let mut path_bytes = vec![0_u8; path_len];
        stream
            .read_exact(&mut path_bytes)
            .map_err(|e| format!("读取文件路径失败: {e}"))?;
        let rel_path =
            String::from_utf8(path_bytes).map_err(|_| "文件路径不是 UTF-8".to_string())?;
        let rel_path = normalize_relative(&rel_path)?;
        let size = read_u64(stream).map_err(|e| format!("读取文件大小失败: {e}"))?;

        let expected_size = expected
            .get(&rel_path)
            .ok_or_else(|| format!("收到清单外文件: {rel_path}"))?;
        if *expected_size != size {
            return Err(format!("文件大小与清单不一致: {rel_path}"));
        }
        if !received.insert(rel_path.clone()) {
            return Err(format!("收到重复文件: {rel_path}"));
        }

        let mapped = map_relative(&rel_path, root_map)?;
        let target = safe_join(save_base, &mapped)?;
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("无法创建目录: {e}"))?;
        }
        let temp = PathBuf::from(format!(
            "{}.huiyun-part-{}",
            target.to_string_lossy(),
            transfer_id.chars().take(8).collect::<String>()
        ));
        let _ = fs::remove_file(&temp);
        let mut output = File::options()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(|e| format!("无法创建临时文件 {}: {e}", temp.display()))?;

        let copy_result = copy_exact(stream, &mut output, size, |count| {
            total_received = total_received.saturating_add(count);
            if last_emit.elapsed() >= Duration::from_millis(100)
                || total_received == manifest.total_bytes
            {
                last_emit = Instant::now();
                let speed = total_received as f64 / started.elapsed().as_secs_f64().max(0.001);
                emit_progress(
                    app,
                    "receive-progress",
                    TransferProgress {
                        id: transfer_id.to_string(),
                        direction: "receive".into(),
                        peer_name: sender_name.to_string(),
                        status: "receiving".into(),
                        total_bytes: manifest.total_bytes,
                        transferred_bytes: total_received,
                        bytes_per_second: speed,
                        file_count: manifest.file_count,
                        error: None,
                    },
                );
                update_offer(
                    state,
                    app,
                    transfer_id,
                    "receiving",
                    Some(total_received),
                    None,
                );
            }
        });

        if let Err(error) = copy_result {
            let _ = fs::remove_file(&temp);
            return Err(format!("接收文件 {rel_path} 失败: {error}"));
        }

        output
            .sync_all()
            .map_err(|e| format!("写入文件 {rel_path} 失败: {e}"))?;
        fs::rename(&temp, &target).map_err(|e| format!("完成文件 {rel_path} 失败: {e}"))?;
    }

    if received.len() != expected.len() {
        return Err(format!(
            "传输未完整结束：应收到 {} 个文件，实际收到 {} 个",
            expected.len(),
            received.len()
        ));
    }
    Ok(())
}

pub fn send_paths(app: AppHandle, state: SharedState, peer: Peer, paths: Vec<PathBuf>) {
    thread::spawn(move || {
        if let Err(error) = send_paths_inner(&app, &state, &peer, &paths) {
            let progress = TransferProgress {
                id: "send-error".into(),
                direction: "send".into(),
                peer_name: peer.name.clone(),
                status: "error".into(),
                total_bytes: 0,
                transferred_bytes: 0,
                bytes_per_second: 0.0,
                file_count: 0,
                error: Some(error),
            };
            emit_progress(&app, "send-progress", progress);
        }
    });
}

fn send_paths_inner(
    app: &AppHandle,
    state: &SharedState,
    peer: &Peer,
    paths: &[PathBuf],
) -> Result<(), String> {
    let scan = scan_paths(paths)?;
    let transfer_id = crate::util::random_hex(16)?;
    let settings = state.settings_snapshot();

    emit_progress(
        app,
        "send-progress",
        TransferProgress {
            id: transfer_id.clone(),
            direction: "send".into(),
            peer_name: peer.name.clone(),
            status: "offering".into(),
            total_bytes: scan.manifest.total_bytes,
            transferred_bytes: 0,
            bytes_per_second: 0.0,
            file_count: scan.manifest.file_count,
            error: None,
        },
    );

    let address = (peer.address.as_str(), peer.port)
        .to_socket_addrs()
        .map_err(|e| format!("目标地址无效: {e}"))?
        .next()
        .ok_or_else(|| "无法解析目标地址".to_string())?;
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(5))
        .map_err(|e| format!("无法连接 {}: {e}", peer.name))?;
    let _ = stream.set_nodelay(true);
    let _ = stream.set_write_timeout(Some(Duration::from_secs(120)));
    let _ = stream.set_read_timeout(Some(Duration::from_secs(OFFER_TTL_SECS + 10)));

    let envelope = OfferEnvelope {
        magic: PROTOCOL_MAGIC.to_string(),
        token: peer.token.clone(),
        transfer_id: transfer_id.clone(),
        sender_id: settings.device_id,
        sender_name: settings.device_name,
        manifest: scan.manifest.clone(),
    };
    write_json_frame(&mut stream, &envelope).map_err(|e| format!("发送请求失败: {e}"))?;

    emit_progress(
        app,
        "send-progress",
        TransferProgress {
            id: transfer_id.clone(),
            direction: "send".into(),
            peer_name: peer.name.clone(),
            status: "waiting".into(),
            total_bytes: scan.manifest.total_bytes,
            transferred_bytes: 0,
            bytes_per_second: 0.0,
            file_count: scan.manifest.file_count,
            error: None,
        },
    );

    let decision: ProtocolReply =
        read_json_frame(&mut stream).map_err(|e| format!("等待对方确认失败: {e}"))?;
    if decision.status != "accepted" {
        return Err(decision.message.unwrap_or_else(|| "对方未接受传输".into()));
    }

    let started = Instant::now();
    let mut sent = 0_u64;
    let mut last_emit = Instant::now() - Duration::from_secs(1);
    for file in &scan.files {
        let path_bytes = file.rel_path.as_bytes();
        if path_bytes.len() > MAX_PATH_BYTES {
            return Err(format!("路径过长: {}", file.rel_path));
        }
        write_u32(&mut stream, path_bytes.len() as u32)
            .map_err(|e| format!("发送文件头失败: {e}"))?;
        stream
            .write_all(path_bytes)
            .map_err(|e| format!("发送文件路径失败: {e}"))?;
        write_u64(&mut stream, file.size).map_err(|e| format!("发送文件大小失败: {e}"))?;

        let mut input = File::open(&file.abs_path)
            .map_err(|e| format!("无法打开 {}: {e}", file.abs_path.display()))?;
        copy_exact(&mut input, &mut stream, file.size, |count| {
            sent = sent.saturating_add(count);
            if last_emit.elapsed() >= Duration::from_millis(100)
                || sent == scan.manifest.total_bytes
            {
                last_emit = Instant::now();
                emit_progress(
                    app,
                    "send-progress",
                    TransferProgress {
                        id: transfer_id.clone(),
                        direction: "send".into(),
                        peer_name: peer.name.clone(),
                        status: "sending".into(),
                        total_bytes: scan.manifest.total_bytes,
                        transferred_bytes: sent,
                        bytes_per_second: sent as f64 / started.elapsed().as_secs_f64().max(0.001),
                        file_count: scan.manifest.file_count,
                        error: None,
                    },
                );
            }
        })
        .map_err(|e| format!("发送 {} 失败: {e}", file.rel_path))?;
    }

    write_u32(&mut stream, 0).map_err(|e| format!("结束传输失败: {e}"))?;
    stream
        .flush()
        .map_err(|e| format!("刷新传输数据失败: {e}"))?;

    let completion: ProtocolReply =
        read_json_frame(&mut stream).map_err(|e| format!("读取完成确认失败: {e}"))?;
    if completion.status != "completed" {
        return Err(completion
            .message
            .unwrap_or_else(|| "接收方未确认完成".into()));
    }

    emit_progress(
        app,
        "send-progress",
        TransferProgress {
            id: transfer_id,
            direction: "send".into(),
            peer_name: peer.name.clone(),
            status: "completed".into(),
            total_bytes: scan.manifest.total_bytes,
            transferred_bytes: scan.manifest.total_bytes,
            bytes_per_second: scan.manifest.total_bytes as f64
                / started.elapsed().as_secs_f64().max(0.001),
            file_count: scan.manifest.file_count,
            error: None,
        },
    );
    Ok(())
}

fn scan_paths(paths: &[PathBuf]) -> Result<ScanResult, String> {
    if paths.is_empty() {
        return Err("请选择文件或文件夹".into());
    }

    let mut files = Vec::new();
    let mut dirs = Vec::new();
    let mut items = Vec::new();
    let mut used_roots = HashSet::<String>::new();
    let mut total_bytes = 0_u64;
    let mut skipped_symlinks = 0_usize;

    for source in paths {
        let metadata = fs::symlink_metadata(source)
            .map_err(|e| format!("无法读取 {}: {e}", source.display()))?;
        if metadata.file_type().is_symlink() {
            skipped_symlinks += 1;
            continue;
        }
        let raw_name = source
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| format!("不支持非 Unicode 文件名: {}", source.display()))?;
        let root_name = unique_virtual_root(raw_name, metadata.is_dir(), &mut used_roots)?;

        let mut item = ItemSummary {
            name: root_name.clone(),
            kind: if metadata.is_dir() { "folder" } else { "file" }.into(),
            size: 0,
            file_count: 0,
            dir_count: 0,
            skipped_symlinks: 0,
        };
        walk_source(
            source,
            &root_name,
            &mut files,
            &mut dirs,
            &mut item,
            &mut total_bytes,
            &mut skipped_symlinks,
        )?;
        items.push(item);
    }

    if files.is_empty() && dirs.is_empty() {
        return Err("没有可发送的普通文件".into());
    }

    let manifest = Manifest {
        file_count: files.len(),
        dir_count: dirs.len(),
        total_bytes,
        skipped_symlinks,
        files: files
            .iter()
            .map(|file| FileEntry {
                rel_path: file.rel_path.clone(),
                size: file.size,
            })
            .collect(),
        dirs,
        items,
    };
    Ok(ScanResult { manifest, files })
}

fn walk_source(
    abs: &Path,
    rel: &str,
    files: &mut Vec<LocalFile>,
    dirs: &mut Vec<String>,
    item: &mut ItemSummary,
    total_bytes: &mut u64,
    skipped_symlinks: &mut usize,
) -> Result<(), String> {
    let metadata =
        fs::symlink_metadata(abs).map_err(|e| format!("无法读取 {}: {e}", abs.display()))?;
    if metadata.file_type().is_symlink() {
        *skipped_symlinks += 1;
        item.skipped_symlinks += 1;
        return Ok(());
    }

    if metadata.is_dir() {
        dirs.push(normalize_relative(rel)?);
        item.dir_count += 1;
        let entries =
            fs::read_dir(abs).map_err(|e| format!("无法读取文件夹 {}: {e}", abs.display()))?;
        for entry in entries {
            let entry = entry.map_err(|e| format!("读取目录项失败: {e}"))?;
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| format!("不支持非 Unicode 文件名: {}", entry.path().display()))?;
            if name.contains('/') || name.contains('\\') || name.contains('\0') {
                return Err(format!("不支持的文件名: {name}"));
            }
            walk_source(
                &entry.path(),
                &format!("{rel}/{name}"),
                files,
                dirs,
                item,
                total_bytes,
                skipped_symlinks,
            )?;
        }
    } else if metadata.is_file() {
        let size = metadata.len();
        let rel_path = normalize_relative(rel)?;
        files.push(LocalFile {
            abs_path: abs.to_path_buf(),
            rel_path,
            size,
        });
        *total_bytes = total_bytes
            .checked_add(size)
            .ok_or_else(|| "发送文件总大小溢出".to_string())?;
        item.size = item.size.saturating_add(size);
        item.file_count += 1;
    }
    Ok(())
}

fn unique_virtual_root(
    name: &str,
    is_dir: bool,
    used: &mut HashSet<String>,
) -> Result<String, String> {
    let normalized = normalize_relative(name)?;
    if normalized.contains('/') {
        return Err("顶层文件名无效".into());
    }
    let path = Path::new(&normalized);
    let ext = if is_dir {
        String::new()
    } else {
        path.extension()
            .and_then(|v| v.to_str())
            .map(|v| format!(".{v}"))
            .unwrap_or_default()
    };
    let stem = if ext.is_empty() {
        normalized.clone()
    } else {
        normalized[..normalized.len() - ext.len()].to_string()
    };
    for index in 0..10_000 {
        let candidate = if index == 0 {
            normalized.clone()
        } else {
            format!("{stem} ({index}){ext}")
        };
        if used.insert(candidate.to_lowercase()) {
            return Ok(candidate);
        }
    }
    Err("选中文件重名过多".into())
}

fn update_offer(
    state: &SharedState,
    app: &AppHandle,
    id: &str,
    status: &str,
    received_bytes: Option<u64>,
    error: Option<String>,
) {
    let mut updated = None;
    if let Ok(mut pending) = state.pending.lock() {
        if let Some(record) = pending.get_mut(id) {
            record.offer.status = status.to_string();
            if let Some(bytes) = received_bytes {
                record.offer.received_bytes = bytes;
            }
            if error.is_some() {
                record.offer.error = error;
            }
            updated = Some(record.offer.clone());
        }
    }
    if let Some(offer) = updated {
        let _ = app.emit("incoming-updated", offer);
    }
}

fn emit_progress(app: &AppHandle, event: &str, progress: TransferProgress) {
    let _ = app.emit(event, progress);
}

fn attention(app: &AppHandle, sender_name: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title(&format!("{sender_name} 发来文件 - 汇云局域网跨传"));
        let _ = window.request_user_attention(Some(UserAttentionType::Critical));
    }
}

pub fn clear_attention(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.request_user_attention(None);
        let _ = window.set_title("汇云局域网跨传");
    }
}

fn read_u32(reader: &mut impl Read) -> io::Result<u32> {
    let mut bytes = [0_u8; 4];
    reader.read_exact(&mut bytes)?;
    Ok(u32::from_be_bytes(bytes))
}

fn read_u64(reader: &mut impl Read) -> io::Result<u64> {
    let mut bytes = [0_u8; 8];
    reader.read_exact(&mut bytes)?;
    Ok(u64::from_be_bytes(bytes))
}

fn write_u32(writer: &mut impl Write, value: u32) -> io::Result<()> {
    writer.write_all(&value.to_be_bytes())
}

fn write_u64(writer: &mut impl Write, value: u64) -> io::Result<()> {
    writer.write_all(&value.to_be_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{env, fs};

    #[test]
    fn scan_includes_empty_directory_and_file() {
        let root = env::temp_dir().join(format!(
            "huiyun-scan-{}",
            crate::util::random_hex(6).unwrap()
        ));
        let source = root.join("source");
        fs::create_dir_all(source.join("empty")).unwrap();
        fs::write(source.join("hello.txt"), b"hello").unwrap();

        let scan = scan_paths(&[source.clone()]).unwrap();
        assert_eq!(scan.manifest.file_count, 1);
        assert!(scan.manifest.dirs.iter().any(|v| v.ends_with("/empty")));
        assert_eq!(scan.manifest.total_bytes, 5);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn manifest_rejects_duplicate_file_path() {
        let manifest = Manifest {
            files: vec![
                FileEntry {
                    rel_path: "a.txt".into(),
                    size: 1,
                },
                FileEntry {
                    rel_path: "a.txt".into(),
                    size: 1,
                },
            ],
            dirs: vec![],
            items: vec![],
            total_bytes: 2,
            file_count: 2,
            dir_count: 0,
            skipped_symlinks: 0,
        };
        assert!(validate_manifest(&manifest).is_err());
    }

    #[test]
    fn virtual_roots_never_collide() {
        let mut used = HashSet::new();
        assert_eq!(
            unique_virtual_root("a.txt", false, &mut used).unwrap(),
            "a.txt"
        );
        assert_eq!(
            unique_virtual_root("a.txt", false, &mut used).unwrap(),
            "a (1).txt"
        );
    }

    #[test]
    fn scan_skips_symlink_when_creation_is_supported() {
        let root = env::temp_dir().join(format!(
            "huiyun-link-{}",
            crate::util::random_hex(6).unwrap()
        ));
        let source = root.join("source");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("real.txt"), b"real").unwrap();

        #[cfg(unix)]
        let link_result =
            std::os::unix::fs::symlink(source.join("real.txt"), source.join("link.txt"));
        #[cfg(windows)]
        let link_result =
            std::os::windows::fs::symlink_file(source.join("real.txt"), source.join("link.txt"));

        if link_result.is_err() {
            let _ = fs::remove_dir_all(root);
            return;
        }

        let scan = scan_paths(&[source]).unwrap();
        assert_eq!(scan.manifest.file_count, 1);
        assert_eq!(scan.manifest.skipped_symlinks, 1);
        let _ = fs::remove_dir_all(root);
    }
}
