// Tauri-команды IDS: файловый слой (std::fs) + host git (CLI).
// База = папка проекта (выбранная пользователем), НЕ app_data_dir.
// Путь к папке запоминается в app_data_dir/paths.json.
// Git-аутентификация — через системный git (credential helper / SSH agent хоста).

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Manager;
use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct FileEntry {
    pub path: String,
    pub content: String,
}

fn join(base: &str, rel: &str) -> PathBuf {
    Path::new(base).join(rel)
}

/// Путь к файлу-указателю (paths.json) в app_data_dir.
fn paths_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("paths.json"))
}

/// Запомненный путь к папке проекта (пусто, если не указан).
#[tauri::command]
pub fn get_folder(app: tauri::AppHandle) -> Result<String, String> {
    let p = paths_file(&app)?;
    if !p.exists() {
        return Ok(String::new());
    }
    let content = fs::read_to_string(p).map_err(|e| e.to_string())?;
    let v: serde_json::Value = serde_json::from_str(&content).unwrap_or_default();
    Ok(v.get("folder").and_then(|s| s.as_str()).unwrap_or("").to_string())
}

/// Сохранить путь к папке проекта.
#[tauri::command]
pub fn set_folder(app: tauri::AppHandle, folder: String) -> Result<(), String> {
    let p = paths_file(&app)?;
    let json = serde_json::json!({ "folder": folder }).to_string();
    fs::write(p, json).map_err(|e| e.to_string())
}

/// Является ли папка git-репозиторием.
#[tauri::command]
pub fn is_git_repo(folder: String) -> bool {
    Path::new(&folder).join(".git").exists()
}

/// Первый запуск / смена папки:
///  - если git-репо → git pull (host git);
///  - создать служебные папки (.dictionary, _template, .tmp) + .gitignore + дефолтные справочники.
#[tauri::command]
pub fn init_project(folder: String) -> Result<(), String> {
    let root = Path::new(&folder);
    fs::create_dir_all(root).map_err(|e| e.to_string())?;

    // git pull, если это репо (ошибки — не критично: может не быть remote)
    if root.join(".git").exists() {
        let _ = Command::new("git")
            .args(["-C", &folder, "pull", "--ff-only"])
            .status();
    }

    // служебные папки
    for d in [".dictionary", "_template", ".tmp"] {
        fs::create_dir_all(root.join(d)).map_err(|e| e.to_string())?;
    }

    // .gitignore (исключает .tmp — черновики и локальный конфиг не синхронизируются)
    let gi = root.join(".gitignore");
    if !gi.exists() {
        fs::write(gi, ".tmp/\n").map_err(|e| e.to_string())?;
    }

    // дефолтные справочники (если файлов нет)
    let defaults: [(&str, &[&str]); 5] = [
        ("type", &["Дефект", "Консультация", "Задача"]),
        ("client", &[]),
        ("environment", &["Препрод", "Прод"]),
        ("product", &[]),
        ("scope", &["Единичное", "Группа", "Все"]),
    ];
    for (name, values) in defaults {
        let p = root.join(".dictionary").join(format!("{}.yaml", name));
        if !p.exists() {
            let mut content = String::from("values:\n");
            for v in values {
                content.push_str(&format!("  - {}\n", v));
            }
            fs::write(p, content).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

// --- Файловый слой ---

#[tauri::command]
pub fn read_localizations(base: String) -> Vec<FileEntry> {
    let mut out = Vec::new();
    let root = Path::new(&base);
    if let Ok(entries) = fs::read_dir(root) {
        for e in entries.flatten() {
            let p = e.path();
            if !p.is_dir() {
                continue;
            }
            let name = e.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || name == "_template" {
                continue;
            }
            if let Ok(files) = fs::read_dir(&p) {
                for f in files.flatten() {
                    let fp = f.path();
                    if fp.extension().and_then(|s| s.to_str()) == Some("md") {
                        let rel = format!("{}/{}", name, f.file_name().to_string_lossy());
                        if let Ok(content) = fs::read_to_string(&fp) {
                            out.push(FileEntry { path: rel, content });
                        }
                    }
                }
            }
        }
    }
    let tmp = root.join(".tmp");
    if let Ok(files) = fs::read_dir(&tmp) {
        for f in files.flatten() {
            let fp = f.path();
            if fp.extension().and_then(|s| s.to_str()) == Some("md") {
                let rel = format!(".tmp/{}", f.file_name().to_string_lossy());
                if let Ok(content) = fs::read_to_string(&fp) {
                    out.push(FileEntry { path: rel, content });
                }
            }
        }
    }
    out
}

#[tauri::command]
pub fn read_repo_files(base: String) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let root = Path::new(&base);
    let dict = root.join(".dictionary");
    if let Ok(entries) = fs::read_dir(&dict) {
        for e in entries.flatten() {
            let p = e.path();
            if p.is_file() {
                let rel = format!(".dictionary/{}", e.file_name().to_string_lossy());
                if let Ok(content) = fs::read_to_string(&p) {
                    map.insert(rel, content);
                }
            }
        }
    }
    for f in ["_template/localization.md", ".gitignore", ".tmp/config.yaml"] {
        let p = root.join(f);
        if let Ok(content) = fs::read_to_string(&p) {
            map.insert(f.to_string(), content);
        }
    }
    map
}

#[tauri::command]
pub fn write_file(base: String, path: String, content: String) -> Result<(), String> {
    let p = join(&base, &path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(p, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_file(base: String, path: String) -> Result<(), String> {
    fs::remove_file(join(&base, &path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_file(base: String, from: String, to: String) -> Result<(), String> {
    let src = join(&base, &from);
    let dst = join(&base, &to);
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(src, dst).map_err(|e| e.to_string())
}

// --- Git (host binary; credentials — через системный git) ---

#[tauri::command]
pub fn git_pull(base: String) -> Result<(), String> {
    let out = Command::new("git")
        .args(["-C", &base, "pull", "--ff-only"])
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).to_string())
    }
}

/// git add -A && git commit -m <msg> --author <a> && git push
#[tauri::command]
pub fn git_sync(base: String, commit_message: String, author_name: String, author_email: String) -> Result<(), String> {
    let author = format!("{} <{}>", author_name, author_email);
    let run = |args: &[&str]| -> Result<(), String> {
        let out = Command::new("git").args(args).output().map_err(|e| e.to_string())?;
        if out.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&out.stderr).to_string())
        }
    };
    run(&["-C", &base, "add", "-A"])?;
    let _ = run(&["-C", &base, "commit", "-m", &commit_message, "--author", &author]); // "nothing to commit" — не ошибка
    run(&["-C", &base, "push"])?;
    Ok(())
}

/// Список локальных веток в папке.
#[tauri::command]
pub fn git_branches(folder: String) -> Result<Vec<String>, String> {
    let out = Command::new("git")
        .args(["-C", &folder, "branch", "--list", "--format=%(refname:short)"])
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout)
            .lines()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).to_string())
    }
}

/// git checkout <branch> && git pull --ff-only
#[tauri::command]
pub fn git_checkout_pull(folder: String, branch: String) -> Result<(), String> {
    let run = |args: &[&str]| -> Result<(), String> {
        let out = Command::new("git").args(args).output().map_err(|e| e.to_string())?;
        if out.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&out.stderr).to_string())
        }
    };
    run(&["-C", &folder, "checkout", &branch])?;
    run(&["-C", &folder, "pull", "--ff-only"])?;
    Ok(())
}
