# OpenCord Mobile

Plain React Native mobile shell for OpenCord.

## Current Surface

- Login screen for selecting any compatible OpenCord server URL.
- Channel list screen.
- Chat screen with local message send state.
- Multi-server add/switch/remove state shared with web and desktop.
- Realtime `message.created` envelope reducer for received messages and unread channel state.
- Push token registration request helper and masked registration state.
- Shared `@opencord/api-client` default server URL normalization.
- Shared `@opencord/realtime` status type foundation.
- Shared `@opencord/server-connections` connection state foundation.
- Android emulator local-alpha default server URL: `http://10.0.2.2:8080`.

## Development

```bash
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter mobile start
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter mobile test
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter mobile build
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter mobile android:build
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter mobile ios
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter mobile android
```

Metro runs on port `8088` to avoid the OpenCord realtime service on `8081`.
Start Metro before `pnpm --filter mobile android`; the Android script installs
and launches with `--no-packager`.

For an Android 15 emulator smoke:

```bash
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"
emulator -list-avds   # pick one of your Android 15 AVDs
emulator -avd <your-avd-name> -no-snapshot-save -no-audio -no-boot-anim
adb wait-for-device
adb shell getprop ro.build.version.release
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter mobile start
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter mobile android
```

## Native Project Ownership

The mobile package uses React Native CLI directly, not Expo. Native Android
project ownership lives under `android/` so future WebRTC, push, secure
storage, media permissions, and app-store build work can use the native
platform project directly. The `ios/` directory is still a placeholder until
iOS native project generation is required.
