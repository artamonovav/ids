mod commands;

// Tauri-команды IDS: ФС (std::fs) + host git (CLI) + папка проекта (paths.json).
// + clipboard-manager плагин: readImage() — fallback для Ctrl+V картинок на
// Linux/WebKit2GTK (Ubuntu 22.04), где clipboardData.items не экспонирует image.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_folder,
            commands::set_folder,
            commands::is_git_repo,
            commands::init_project,
            commands::read_localizations,
            commands::read_repo_files,
            commands::write_file,
            commands::delete_file,
            commands::rename_file,
            commands::write_attachment,
            commands::read_attachments,
            commands::git_pull,
            commands::git_sync,
            commands::git_branches,
            commands::git_checkout_pull,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
