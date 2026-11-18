#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    {
        // Escape-hatch для проблемных GPU (WebKitGTK DMABUF-рендерер на части
        // Intel/NVIDIA рисует пустую поверхность). По умолчанию НЕ включаем:
        // на рабочих конфигурациях DMABUF быстрее. Если окно пустое/прозрачное —
        // запустите с IDS_DISABLE_DMABUF=1.
        if std::env::var_os("IDS_DISABLE_DMABUF").is_some()
            && std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none()
        {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }
    ids_desktop_lib::run()
}
