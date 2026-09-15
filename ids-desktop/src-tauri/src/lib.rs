mod commands;

// Tauri-команды: ФС (std::fs) + git (CLI) + get_base (app_data_dir).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::get_base,
            commands::read_localizations,
            commands::read_repo_files,
            commands::write_file,
            commands::delete_file,
            commands::rename_file,
            commands::git_clone,
            commands::git_pull,
            commands::git_sync,
            commands::git_branches,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
