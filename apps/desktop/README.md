# OpenCord Desktop

Electron desktop shell for the OpenCord web renderer.

## Current Surface

- Loads `apps/web/dist/index.html` by default.
- Loads `OPENCORD_DESKTOP_RENDERER_URL` when running against a Vite dev server.
- Uses secure renderer defaults: `contextIsolation`, `sandbox`, `webSecurity`, and no Node integration.
- Exposes a narrow preload bridge as `window.openCordDesktop`.
- Provides `window.openCordDesktop.notifications.showMessage(...)` for validated native message notifications.
- Provides `window.openCordDesktop.desktopState.update(...)` so the renderer can publish non-secret server, channel, and voice state for native menus and tray.
- Provides `window.openCordDesktop.desktopCommands.onCommand(...)` for validated native menu/tray commands back into the renderer.
- Provides `window.openCordDesktop.screenShare.onPickerRequest(...)` and `screenShare.respond(...)` for a custom screen/window picker backed by Electron `desktopCapturer`.
- Provides `window.openCordDesktop.lifecycle.onState(...)` for validated visible, hidden, minimized, focus, and background realtime state.
- Adds native app menu entries for server switching, quick channel search, channel switching, settings, voice controls, reload, and dev tools in dev builds.
- Adds a tray menu for show/hide, current server/channel/voice state, mute/deafen/leave, and quit.
- Keeps the renderer alive on window close by hiding to tray unless OpenCord is explicitly quitting.
- Disables renderer background throttling so hidden/minimized desktop realtime and voice control state can continue running.
- Opens external navigation through the OS browser.
- Uses the web renderer's browser screen capture flow for screen sharing with an Electron source picker, preserving the secure preload boundary.

## Development

```bash
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter web build
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter desktop build
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter desktop start
```

Run the launch smoke check:

```bash
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter desktop exec electron dist/main.js --smoke
```

Run the hidden-window background lifecycle smoke check:

```bash
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter desktop exec electron dist/main.js --background-smoke
```
