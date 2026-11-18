mod commands;
mod logging;

// Tauri-команды IDS: ФС (std::fs) + host git (CLI).
// Путь проекта и настройки пользователя — в config.yaml (папка конфигурации ОС).
// + clipboard-manager плагин: readImage() — fallback для Ctrl+V картинок на
// Linux/WebKit2GTK (Ubuntu 22.04), где clipboardData.items не экспонирует image.
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Журнал: <config_dir>/ids/app.log — лог работы + лог git-команд.
            if let Some(dir) = app
                .path()
                .config_dir()
                .ok()
                .map(|d| d.join("ids"))
            {
                let _ = std::fs::create_dir_all(&dir);
                logging::init(dir.join("app.log"));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::read_legacy_folder,
            commands::is_git_repo,
            commands::git_pull_only,
            commands::init_project,
            commands::read_localizations,
            commands::read_repo_files,
            commands::write_file,
            commands::delete_file,
            commands::rename_file,
            commands::write_attachment,
            commands::read_attachments,
            commands::read_app_config,
            commands::write_app_config,
            commands::read_logs,
            commands::export_logs,
            commands::log_event,
            commands::git_clone,
            commands::git_identity,
            commands::git_set_identity,
            commands::git_sync,
            commands::git_branches,
            commands::git_checkout_pull,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
