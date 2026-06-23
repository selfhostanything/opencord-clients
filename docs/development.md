# Development

OpenCord uses a Node.js 26 and pnpm workspace for the official clients and
shared TypeScript packages.

## Runtime

Use Node.js 26 with `fnm`.

```bash
fnm use 26
corepack enable
pnpm install
```

## Apps

- `apps/web`: React/Vite web client with multi-server switching, chat UI,
  calendar tab, meeting room UI, voice controls, screen share controls, rich
  embeds, developer bot/webhook panels, TanStack Router, TanStack Query, and
  Zustand local UI state.
- `apps/desktop`: Electron shell for the web client.
- `apps/mobile`: plain React Native app shell with mobile chat, voice, and
  connection state.

## Packages

- `packages/api-client`: REST API client boundary.
- `packages/realtime`: realtime gateway client boundary.
- `packages/server-connections`: shared multi-server connection manager and
  persistence helpers.
- `packages/media`: media integration client boundary.
- `packages/types`: shared TypeScript types.
- `packages/validation`: shared validation schemas.
- `packages/permissions`: shared permission helpers.
- `packages/ui-tokens`: shared design tokens.

## Common Commands

```bash
pnpm install
pnpm --filter web dev
pnpm test
pnpm lint
pnpm build
```

The web app defaults to `http://localhost:8080` for a local OpenCord server.
Users can add, switch, remove, and persist multiple compatible OpenCord server
connections.

## Local Alpha Web

Run the server stack first from the sibling `opencord-server` checkout:

```bash
make dev-deps
make migrate
make seed
make dev-api
make dev-realtime
make dev-worker
```

Then start or test the web client:

```bash
pnpm --filter web dev
pnpm --filter web test
pnpm --filter web lint
pnpm --filter web build
pnpm --filter web test:e2e
```

The Playwright e2e test uses the real local API at `http://localhost:8080`.
It creates a unique local-alpha user/workspace for chat send/edit/delete and
uses the seeded owner workspace for rich messages, attachments, voice channel
visibility, bot/webhook messages, meeting UI, authenticated ICS output, and raw
browser WebSocket reconnect. Keep `tests/e2e` under Playwright; Vitest excludes
that folder so unit and browser suites do not mix.

## Desktop

Build the web renderer and Electron shell before launch smoke:

```bash
pnpm --filter web build
pnpm --filter desktop test
pnpm --filter desktop build
pnpm --filter desktop exec electron dist/main.js --smoke
```

The smoke command exits after the renderer loads and prints
`opencord-desktop-ready`.

## Mobile And Android

The mobile app is plain React Native CLI, not Expo. Metro uses port `8088` so
it can run beside the OpenCord realtime service on `8081`.

```bash
pnpm --filter mobile test
pnpm --filter mobile lint
pnpm --filter mobile build
pnpm --filter mobile android:build
pnpm --filter mobile exec react-native bundle \
  --platform android \
  --entry-file index.js \
  --dev false \
  --bundle-output /tmp/opencord-mobile.android.bundle \
  --assets-dest /tmp/opencord-mobile-assets \
  --reset-cache
```

For Android emulator smoke on this machine:

```bash
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"
emulator -list-avds
emulator -avd <your-avd-name> -no-snapshot-save -no-audio -no-boot-anim
# Headless CI/local smoke can also add: -no-window
adb wait-for-device
adb shell getprop ro.build.version.release
pnpm --filter mobile start
pnpm --filter mobile android
```

The Android emulator reaches the host OpenCord API through
`http://10.0.2.2:8080`; do not use `localhost` inside the emulator.
The Phase 09 local smoke verified Android 15, installed `com.opencord`,
rendered the login screen with `http://10.0.2.2:8080`, and reached the
`Channels` screen after entering a local email.

Verified customer custom domains work as normal server URLs. For example, once
`customer.example.com` resolves through the OpenCord ingress and the server
custom-domain mapping is active, the official web, desktop, and mobile clients
can connect to `https://customer.example.com`.

## OpenAPI Boundary

`packages/api-client` keeps the hand-written ergonomic client, but generated
OpenAPI types sit at the package boundary:

```bash
pnpm --filter @opencord/api-client generate:openapi
pnpm --filter @opencord/api-client check:openapi
```

By default the generator reads the sibling server repo at:

```text
../../../opencord-server/openapi/openapi.yaml
```

Set `OPENAPI_SPEC_PATH` when generating from another checkout or downloaded
server artifact.
