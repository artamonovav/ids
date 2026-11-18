// Журнал работы IDS: один файл в папке конфигурации ОС — <config_dir>/ids/app.log
// (вне папки проекта, не синхронизируется, переживает перезапуск).
//
// Строка лога: `YYYY-MM-DD HH:MM:SS.mmm [kind] message`, kind = `app` | `git`:
//  - `app` — работа приложения: открытие проекта, запись/удаление файлов,
//    создание черновиков, синхронизация (события приходят из store.ts через
//    команду log_event и из файловых команд commands.rs);
//  - `git` — выполнение host-git-команд: строка запуска + код выхода
//    (+ stderr при ошибке). Пишется хелпером run_git() в commands.rs.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// Ротация: файл больше лимита переименовывается в app.log.1 при запуске.
const MAX_BYTES: u64 = 4 * 1024 * 1024;

/// Путь к файлу лога (инициализируется в lib.rs setup). None — до init() или
/// если путь не задан: вызовы log() тогда просто игнорируются.
static LOG_FILE: Mutex<Option<PathBuf>> = Mutex::new(None);

/// Инициализация при старте приложения: путь + ротация + запись «запуск».
pub fn init(path: PathBuf) {
    let mut guard = LOG_FILE.lock().ok();
    if let Some(guard) = guard.as_mut() {
        if let Ok(meta) = fs::metadata(&path) {
            if meta.len() > MAX_BYTES {
                let rotated = path.with_extension("log.1");
                let _ = fs::rename(&path, rotated);
            }
        }
        **guard = Some(path);
    }
    log("app", "=== запуск IDS ===");
}

/// Записать событие в журнал. Переносы строк сглаживаются — одна строка = одно
/// событие, чтобы файл удобно фильтровать по `[kind]`.
pub fn log(kind: &str, message: &str) {
    let kind = match kind {
        "app" | "git" => kind,
        _ => "app",
    };
    let line = format!("{} [{}] {}\n", timestamp(), kind, sanitize(message));
    let guard = LOG_FILE.lock().ok();
    let Some(path) = guard.as_deref().and_then(|o| o.as_ref()) else {
        return;
    };
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = f.write_all(line.as_bytes());
    }
}

/// Полный текст журнала (пусто — файла ещё нет).
pub fn read() -> String {
    let guard = LOG_FILE.lock().ok();
    let Some(path) = guard.as_deref().and_then(|o| o.as_ref()) else {
        return String::new();
    };
    fs::read_to_string(path).unwrap_or_default()
}

/// Выгрузить журнал в файл по пути, выбранному пользователем (диалог сохранения).
pub fn export(target: &str) -> Result<(), String> {
    let target = target.trim();
    if target.is_empty() {
        return Err("не указан путь для выгрузки".into());
    }
    if let Some(parent) = std::path::Path::new(target).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(target, read()).map_err(|e| e.to_string())
}

fn sanitize(message: &str) -> String {
    let single = message.replace('\r', "").replace('\n', " | ");
    single.chars().take(2000).collect()
}

/// UTC-время события. Формат вручную — без chrono: секунды с эпохи
/// переводятся алгоритмом Хиннанта (civil_from_days).
fn timestamp() -> String {
    let d = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = d.as_secs();
    let millis = d.subsec_millis();
    let (y, m, day) = civil_from_days((secs / 86400) as i64);
    let sod = secs % 86400;
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}.{:03}",
        y,
        m,
        day,
        sod / 3600,
        (sod % 3600) / 60,
        sod % 60,
        millis
    )
}

/// Дни с 1970-01-01 → (год, месяц, день), UTC. Howard Hinnant, cc-by-sa.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

#[cfg(test)]
mod tests {
    use super::civil_from_days;

    #[test]
    fn epoch_is_1970_01_01() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
    }

    #[test]
    fn known_dates() {
        // 2026-11-18 — 20775 дней с эпохи
        assert_eq!(civil_from_days(20775), (2026, 11, 18));
        // 2024-02-29 — високосный день (59-й день года)
        assert_eq!(civil_from_days(19782), (2024, 2, 29));
    }
}
