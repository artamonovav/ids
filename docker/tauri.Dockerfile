# Образ для сборки десктоп-приложения Tauri (Linux .deb / .AppImage).
# Rust и системные зависимости УЖЕ ВНУТРИ образа — на хост ставить Rust не нужно.
# (Корпоративная блокировка установки Rust обходится сборкой этого образа.)

FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# Системные зависимости Tauri 2 (Linux).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libwebkit2gtk-4.1-dev \
    build-essential curl wget file pkg-config \
    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev librsvg2-bin \
    libgtk-3-dev libjavascriptcoregtk-4.1-dev libsoup-3.0-dev \
    git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Node 20 + Bun (фронтенд Tauri).
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g bun \
    && rm -rf /var/lib/apt/lists/*

# Rust (ставится ВНУТРИ образа — на хост не требуется).
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /app
CMD ["bash"]
