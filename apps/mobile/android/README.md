# OpenCord Android

Plain React Native Android project generated from the React Native 0.86 CLI
template and owned by `apps/mobile`.

## Local Commands

```bash
pnpm --filter mobile android:build
pnpm --filter mobile start
pnpm --filter mobile android
```

`pnpm --filter mobile start` runs Metro on `8088`. Keep it running in one
terminal, then run `pnpm --filter mobile android` from another terminal. The
Android script uses `--no-packager` because Codex/local shells cannot reliably
open a separate Metro terminal window.

The Android emulator local server URL is `http://10.0.2.2:8080`.

Do not add Expo config or Expo runtime dependencies here.
