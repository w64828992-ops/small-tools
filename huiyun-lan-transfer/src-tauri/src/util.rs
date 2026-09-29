use serde::{de::DeserializeOwned, Serialize};
use std::{
    collections::HashSet,
    io::{self, Read, Write},
    net::IpAddr,
    path::{Component, Path, PathBuf},
};

pub const PROTOCOL_MAGIC: &str = "huiyun-lan-transfer/2";
pub const DISCOVERY_PORT: u16 = 45871;
pub const OFFER_TTL_SECS: u64 = 600;
pub const MAX_FRAME_BYTES: usize = 16 * 1024 * 1024;
pub const COPY_BUFFER_BYTES: usize = 1024 * 1024;

pub fn random_hex(bytes: usize) -> Result<String, String> {
    let mut raw = vec![0_u8; bytes];
    getrandom::fill(&mut raw).map_err(|e| format!("随机数生成失败: {e}"))?;
    let mut out = String::with_capacity(bytes * 2);
    for byte in raw {
        use std::fmt::Write as _;
        let _ = write!(out, "{byte:02x}");
    }
    Ok(out)
}

pub fn is_lan_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4.is_loopback() || v4.is_private() || v4.is_link_local(),
        IpAddr::V6(v6) => {
            if v6.is_loopback() || v6.is_unicast_link_local() {
                return true;
            }
            let first = v6.segments()[0];
            (first & 0xfe00) == 0xfc00
                || v6
                    .to_ipv4_mapped()
                    .map(|v4| v4.is_loopback() || v4.is_private() || v4.is_link_local())
                    .unwrap_or(false)
        }
    }
}

pub fn normalize_relative(input: &str) -> Result<String, String> {
    if input.is_empty() || input.len() > 4096 || input.contains('\0') {
        return Err("无效的相对路径".into());
    }
    let normalized = input.replace('\\', "/");
    if normalized.starts_with('/') || normalized.starts_with("//") {
        return Err("禁止绝对路径".into());
    }
    if normalized.len() >= 2 && normalized.as_bytes()[1] == b':' {
        return Err("禁止盘符绝对路径".into());
    }
    let parts: Vec<&str> = normalized.split('/').collect();
    if parts
        .iter()
        .any(|p| p.is_empty() || *p == "." || *p == "..")
    {
        return Err("禁止路径穿越".into());
    }
    Ok(parts.join("/"))
}

pub fn safe_join(base: &Path, relative: &str) -> Result<PathBuf, String> {
    let normalized = normalize_relative(relative)?;
    let mut target = base.to_path_buf();
    for part in normalized.split('/') {
        target.push(part);
    }
    let clean_base = lexical_clean(base);
    let clean_target = lexical_clean(&target);
    if clean_target == clean_base || clean_target.starts_with(&clean_base) {
        Ok(clean_target)
    } else {
        Err("目标路径越界".into())
    }
}

fn lexical_clean(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

pub fn validate_current_platform_path(relative: &str) -> Result<(), String> {
    let normalized = normalize_relative(relative)?;
    #[cfg(target_os = "windows")]
    {
        for segment in normalized.split('/') {
            let lower = segment.to_ascii_lowercase();
            let stem = lower.split('.').next().unwrap_or("");
            let reserved = matches!(stem, "con" | "prn" | "aux" | "nul")
                || (stem.len() == 4
                    && (stem.starts_with("com") || stem.starts_with("lpt"))
                    && stem[3..]
                        .parse::<u8>()
                        .map(|n| (1..=9).contains(&n))
                        .unwrap_or(false));
            if segment
                .chars()
                .any(|c| r#"<>:"|?*"#.contains(c) || (c as u32) < 32)
                || segment.ends_with(' ')
                || segment.ends_with('.')
                || reserved
            {
                return Err(format!("Windows 不支持该文件名: {segment}"));
            }
        }
    }
    Ok(())
}

pub fn unique_top_level_name(
    base: &Path,
    name: &str,
    is_dir: bool,
    reserved: &mut HashSet<String>,
) -> Result<String, String> {
    let normalized = normalize_relative(name)?;
    if normalized.contains('/') {
        return Err("顶层名称不能包含目录分隔符".into());
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
        let key = candidate.to_lowercase();
        if !reserved.contains(&key) && !base.join(&candidate).exists() {
            reserved.insert(key);
            return Ok(candidate);
        }
    }
    Err("无法生成不重复的保存名称".into())
}

pub fn write_json_frame<T: Serialize>(writer: &mut impl Write, value: &T) -> io::Result<()> {
    let data = serde_json::to_vec(value)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e.to_string()))?;
    if data.len() > MAX_FRAME_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "frame too large",
        ));
    }
    writer.write_all(&(data.len() as u32).to_be_bytes())?;
    writer.write_all(&data)?;
    writer.flush()
}

pub fn read_json_frame<T: DeserializeOwned>(reader: &mut impl Read) -> io::Result<T> {
    let mut len_buf = [0_u8; 4];
    reader.read_exact(&mut len_buf)?;
    let len = u32::from_be_bytes(len_buf) as usize;
    if len == 0 || len > MAX_FRAME_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "invalid frame length",
        ));
    }
    let mut data = vec![0_u8; len];
    reader.read_exact(&mut data)?;
    serde_json::from_slice(&data)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e.to_string()))
}

pub fn copy_exact(
    reader: &mut impl Read,
    writer: &mut impl Write,
    expected: u64,
    mut on_chunk: impl FnMut(u64),
) -> io::Result<()> {
    let mut remaining = expected;
    let mut buffer = vec![0_u8; COPY_BUFFER_BYTES];
    while remaining > 0 {
        let want = usize::try_from(remaining.min(buffer.len() as u64)).unwrap_or(buffer.len());
        let read = reader.read(&mut buffer[..want])?;
        if read == 0 {
            return Err(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                "file stream ended early",
            ));
        }
        writer.write_all(&buffer[..read])?;
        remaining -= read as u64;
        on_chunk(read as u64);
    }
    writer.flush()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{Ipv4Addr, Ipv6Addr};

    #[test]
    fn lan_ranges_are_correct() {
        assert!(is_lan_ip(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 8))));
        assert!(is_lan_ip(IpAddr::V4(Ipv4Addr::new(10, 0, 0, 8))));
        assert!(is_lan_ip(IpAddr::V4(Ipv4Addr::LOCALHOST)));
        assert!(is_lan_ip(IpAddr::V6(Ipv6Addr::LOCALHOST)));
        assert!(!is_lan_ip(IpAddr::V4(Ipv4Addr::new(8, 8, 8, 8))));
    }

    #[test]
    fn traversal_is_rejected() {
        for bad in [
            "../a",
            "a/../b",
            "/tmp/a",
            "C:\\Windows\\a",
            "a//b",
            "a/./b",
        ] {
            assert!(normalize_relative(bad).is_err(), "{bad}");
        }
        assert_eq!(normalize_relative("folder/a.txt").unwrap(), "folder/a.txt");
    }

    #[test]
    fn destination_collision_never_overwrites() {
        let root = std::env::temp_dir().join(format!("huiyun-name-{}", random_hex(5).unwrap()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("report.txt"), b"old").unwrap();
        let mut reserved = HashSet::new();
        let name = unique_top_level_name(&root, "report.txt", false, &mut reserved).unwrap();
        assert_eq!(name, "report (1).txt");
        assert_eq!(std::fs::read(root.join("report.txt")).unwrap(), b"old");
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn json_frame_roundtrip() {
        let value = serde_json::json!({"name":"汇云","count":3});
        let mut bytes = Vec::new();
        write_json_frame(&mut bytes, &value).unwrap();
        let decoded: serde_json::Value = read_json_frame(&mut std::io::Cursor::new(bytes)).unwrap();
        assert_eq!(decoded, value);
    }
}
