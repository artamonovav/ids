// Tauri-команды IDS: файловый слой (std::fs) + git (системный CLI) + путь к репозиторию.
// Фронтенд парсит frontmatter/конфиг сам — Rust только читает/пишет файлы и гоняет git.

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

/// Локальный путь к репозиторию (Tauri app_data_dir). Туда клонируется репо IDS.
#[tauri::command]
pub fn get_base(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

fn git_env(auth_method: &str, ssh_key: &str) -> Vec<(&'static str, String)> {
    if auth_method == "ssh" && !ssh_key.is_empty() {
        vec![(
            "GIT_SSH_COMMAND",
            format!("ssh -i {} -o StrictHostKeyChecking=accept-new", ssh_key),
        )]
    } else {
        vec![]
    }
}

fn run_git(env: &[(&str, String)], args: &[&str]) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.args(args);
    for (k, v) in env {
        cmd.env(k, v);
    }
    let out = cmd.output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).to_string())
    }
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

// --- Git (системный CLI) ---

#[tauri::command]
pub fn git_clone(url: String, base: String, auth_method: String, ssh_key: String) -> Result<(), String> {
    let env = git_env(&auth_method, &ssh_key);
    run_git(&env, &["clone", &url, &base]).map(|_| ())
}

#[tauri::command]
pub fn git_pull(base: String, auth_method: String, ssh_key: String) -> Result<(), String> {
    let env = git_env(&auth_method, &ssh_key);
    run_git(&env, &["-C", &base, "pull", "--ff-only"]).map(|_| ())
}

#[tauri::command]
pub fn git_sync(
    base: String,
    commit_message: String,
    author_name: String,
    author_email: String,
    auth_method: String,
    ssh_key: String,
) -> Result<(), String> {
    let env = git_env(&auth_method, &ssh_key);
    run_git(&env, &["-C", &base, "add", "-A"])?;
    let author = format!("{} <{}>", author_name, author_email);
    let _ = run_git(&env, &["-C", &base, "commit", "-m", &commit_message, "--author", &author]);
    run_git(&env, &["-C", &base, "push"])?;
    Ok(())
}

#[tauri::command]
pub fn git_branches(url: String, auth_method: String, ssh_key: String) -> Result<Vec<String>, String> {
    let env = git_env(&auth_method, &ssh_key);
    let out = run_git(&env, &["ls-remote", "--heads", &url])?;
    let mut branches = Vec::new();
    for line in out.lines() {
        if let Some((_sha, refname)) = line.split_once('\t') {
            let name = refname.strip_prefix("refs/heads/").unwrap_or(refname);
            branches.push(name.to_string());
        }
    }
    if branches.is_empty() {
        branches.push("main".to_string());
    }
    Ok(branches)
}
