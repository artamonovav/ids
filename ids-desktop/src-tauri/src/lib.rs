mod commands;

// Tauri-команды IDS: ФС (std::fs) + host git (CLI) + папка проекта (paths.json).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            commands::git_pull,
            commands::git_sync,
            commands::git_branches,
            commands::git_checkout_pull,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
