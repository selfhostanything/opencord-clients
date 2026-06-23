# OpenCord

[![GitHub stars](https://img.shields.io/github/stars/selfhostanything/opencord?style=social)](https://github.com/selfhostanything/opencord/stargazers)

OpenCord is a self-hostable, Discord-like workspace chat client for teams,
communities, and organizations that want control over where their conversations
live.

This repository contains the official open-source clients:

- Web app
- Electron desktop app
- React Native mobile app
- Shared TypeScript SDK packages

The clients can connect to any compatible OpenCord server URL, including a
self-hosted server, an organization-owned deployment, or a managed OpenCord
cloud tenant.

## Why OpenCord

- Own your chat data instead of depending on a single hosted platform.
- Use familiar Discord-style chat, channels, voice, meetings, webhooks, and bot
  workflows.
- Connect one client to multiple OpenCord servers.
- Keep the client open source while allowing different server deployment models.

## Current Status

OpenCord is in early MVP development. The client already includes core chat UI,
multi-server connection management, desktop/mobile shells, meeting and voice UI
surfaces, rich embeds, and developer panels for bot and webhook workflows.

The project is not a Discord clone. Compatibility exists to make migration
easier for common bot and webhook workflows while preserving OpenCord's own
permissions, identity, and deployment model.

## Quick Start

```bash
fnm use 26
corepack enable
pnpm install
pnpm --filter web dev
```

The web client defaults to `http://localhost:8080` for local development.
For local alpha dogfood, run `make seed` in the sibling `opencord-server`
checkout, then sign in with `owner@opencord.local` and password
`correct horse battery staple`.

## Repository

```text
apps/web       Web client
apps/desktop   Electron desktop shell
apps/mobile    React Native mobile app
packages/*     Shared client packages
```

Developer details live in [docs/development.md](docs/development.md).

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=selfhostanything/opencord&type=Date)](https://www.star-history.com/#selfhostanything/opencord&Date)

## License

Apache-2.0
