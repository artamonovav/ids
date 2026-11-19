#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    {
        // WebKitGTK DMABUF-рендерер на Ubuntu 22.04 (WebKit ~2.40) рисует
        // пустую/прозрачную поверхность — вместо UI виден рабочий стол.
        // На 22.04 отключаем автоматически; 24.04+ не трогаем (там рендерер
        // работает и быстрее). Escape-hatch в обе стороны:
        //   IDS_ENABLE_DMABUF=1      — принудительно включить на 22.04;
        //   IDS_DISABLE_DMABUF=1     — принудительно выключить на любой ОС.
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none()
            && std::env::var_os("IDS_ENABLE_DMABUF").is_none()
        {
            let is_ubuntu_2204 = std::fs::read_to_string("/etc/os-release")
                .map(|os| {
                    os.lines().any(|l| {
                        l.starts_with("VERSION_ID=") && l.contains("22.04")
                    })
                })
                .unwrap_or(false);
            if is_ubuntu_2204 {
                std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
            }
        }
        if std::env::var_os("IDS_DISABLE_DMABUF").is_some()
            && std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none()
        {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }
    ids_desktop_lib::run()
}
