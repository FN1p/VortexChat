<div align="center">

# ⚡ VortexChat

**A customizable streaming companion for Twitch and YouTube**

**Удобный чат, гибкие настройки и подсветка видео для стримов**

[![Release](https://img.shields.io/github/v/release/FN1p/VortexChat?include_prereleases&style=for-the-badge&label=Beta%20release)](https://github.com/FN1p/VortexChat/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/FN1p/VortexChat/extension.yml?branch=main&style=for-the-badge&label=Extension%20checks)](https://github.com/FN1p/VortexChat/actions)
[![License](https://img.shields.io/github/license/FN1p/VortexChat?style=for-the-badge)](LICENSE)
[![Telegram](https://img.shields.io/badge/Telegram-PFT_Studio-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/PFT_Studio)

**[⬇ Download / Скачать](https://github.com/FN1p/VortexChat/releases)** · **[Telegram / Новости](https://t.me/PFT_Studio)** · **[English](#english)** · **[Русский](#русский)** · **[Issues](https://github.com/FN1p/VortexChat/issues)**

</div>

---

## English

VortexChat is an independent, experimental streaming toolkit from **PFT Studio**. It combines a **Windows desktop Twitch chat client** with a **Chromium browser extension** for Twitch chat enhancements and YouTube player visuals.

| 🪟 Desktop (Windows) | 🧩 Browser extension |
| --- | --- |
| Twitch chat, multiple channels, emotes | 7TV, BTTV and FFZ on Twitch |
| OBS Browser Source overlay on localhost:5222 | Message highlights, favorites, reading tools |
| Setup installer or portable EXE | YouTube player glow, theater mode, PiP |
| Release notifications (opens GitHub; no automatic installation yet) | Opacity, blur and visual preferences |

### Installation

**Windows:** download `VortexChat-Setup-*.exe` (installer) or `VortexChat-Portable-*.exe` from [Releases](https://github.com/FN1p/VortexChat/releases). For Twitch login, you need your own Twitch application Client ID.

**Browser:** download `VortexChat-7TV-Extension.zip`, extract it, open `chrome://extensions`, enable *Developer mode*, choose *Load unpacked* and select the extracted folder. Refresh any already-open Twitch or YouTube tabs.

**Beta limitations:** YouTube Ambilight depends on video playback and browser media restrictions. Some protected videos may show a fallback glow. Desktop release checks use GitHub; automatic background download and installation are not yet implemented. This project is not affiliated with Twitch, YouTube, 7TV or BTTV.

The browser extension adds configurable mention highlighting and sound, session-only input history, optional grouping of similar repeated messages, a live-edge button and opt-in gentle catchup, channel shortcuts, and optional sidebar stream previews. Twitch moderation text is shown when Twitch retains the original message in its chat data. These options are available in the extension popup and Twitch settings panel.

The default Twitch theme uses a denser, flatter dark chat layout. The live-edge control ignores Twitch's placeholder seekable value, which otherwise looks like an enormous delay.

**Studio news:** [PFT Studio on Telegram](https://t.me/PFT_Studio).

## Русский

**VortexChat** — экспериментальный проект PFT Studio для стримеров. В нём есть отдельный Windows-клиент чата Twitch и браузерное расширение для Twitch и YouTube.

- **Windows:** несколько каналов, смайлы 7TV/BTTV/FFZ, чат и оверлей для OBS на `127.0.0.1:5222`.
- **Twitch в браузере:** смайлы, подсветка сообщений, инструменты чтения и настройки отображения.
- **YouTube:** Ambilight, кнопка ✦ Vortex в плеере, кинотеатральный режим, PiP и визуальные настройки.
- **Обновления:** Windows-приложение проверяет GitHub Releases и предлагает открыть страницу обновления. Автоматической установки пока нет.

**Новости студии:** [Telegram-канал PFT Studio](https://t.me/PFT_Studio).

### Установка

**На Windows:** скачайте `VortexChat-Setup-*.exe` или `VortexChat-Portable-*.exe` со страницы [Releases](https://github.com/FN1p/VortexChat/releases).

**Расширение:** скачайте ZIP, распакуйте, откройте `chrome://extensions`, включите **Режим разработчика**, нажмите **Загрузить распакованное расширение** и выберите папку с файлами. Обновите страницы Twitch/YouTube.

**Ограничения Beta:** подсветка видео может работать по-разному в зависимости от браузера и защиты контента. Некоторые эффекты ещё требуют проверки на реальных трансляциях.

---

### Development / Разработка

```bash
node --test tests/extension.test.cjs
node --test tests/desktop-*.test.cjs
```

| Directory | Purpose |
| --- | --- |
| `desktop-app/` | Electron application and OBS bridge |
| `extension/` | Manifest V3 Chromium extension |
| `tests/` | Regression tests |
| `.github/workflows/` | Windows builds and extension checks |

More details: [Extension guide](extension/README.md) · [Desktop guide](desktop-app/README.md) · [License](LICENSE).

<div align="center"><sub>Made by PFT Studio · Experimental beta software</sub></div>
