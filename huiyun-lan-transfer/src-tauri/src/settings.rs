use crate::{models::Settings, util::random_hex};
use std::{
    fs,
    path::{Path, PathBuf},
};

pub struct SettingsStore {
    path: PathBuf,
    current: Settings,
}

impl SettingsStore {
    pub fn load(app_data_dir: &Path) -> Result<Self, String> {
        fs::create_dir_all(app_data_dir).map_err(|e| format!("无法创建配置目录: {e}"))?;
        let path = app_data_dir.join("settings.json");
        let existing = fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str::<Settings>(&text).ok());

        let default_name = hostname::get()
            .ok()
            .and_then(|v| v.into_string().ok())
            .filter(|v| !v.trim().is_empty())
            .unwrap_or_else(|| "我的电脑".to_string());

        let current = match existing {
            Some(mut settings) => {
                if settings.device_id.trim().len() < 16 {
                    settings.device_id = random_hex(16)?;
                }
                if settings.device_name.trim().is_empty() {
                    settings.device_name = default_name;
                }
                settings
            }
            None => Settings {
                device_id: random_hex(16)?,
                device_name: default_name,
            },
        };

        let store = Self { path, current };
        store.persist()?;
        Ok(store)
    }

    pub fn get(&self) -> Settings {
        self.current.clone()
    }

    pub fn set_device_name(&mut self, name: &str) -> Result<Settings, String> {
        let clean = name
            .replace(['\r', '\n', '\t'], " ")
            .trim()
            .chars()
            .take(64)
            .collect::<String>();
        if clean.is_empty() {
            return Err("电脑名称不能为空".into());
        }
        self.current.device_name = clean;
        self.persist()?;
        Ok(self.current.clone())
    }

    fn persist(&self) -> Result<(), String> {
        let bytes =
            serde_json::to_vec_pretty(&self.current).map_err(|e| format!("配置序列化失败: {e}"))?;
        // Windows does not replace an existing destination with fs::rename reliably.
        // This settings file is tiny, so a direct overwrite is simpler and avoids a name-change bug.
        fs::write(&self.path, bytes).map_err(|e| format!("无法保存配置: {e}"))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_name_can_be_updated_more_than_once() {
        let root = std::env::temp_dir().join(format!(
            "huiyun-settings-{}",
            crate::util::random_hex(6).unwrap()
        ));
        let mut store = SettingsStore::load(&root).unwrap();
        store.set_device_name("第一台电脑").unwrap();
        store.set_device_name("第二台电脑").unwrap();
        assert_eq!(store.get().device_name, "第二台电脑");

        let reloaded = SettingsStore::load(&root).unwrap();
        assert_eq!(reloaded.get().device_name, "第二台电脑");
        let _ = std::fs::remove_dir_all(root);
    }
}
