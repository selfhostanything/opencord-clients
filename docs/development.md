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
  embeds, and developer bot/webhook panels.
- `apps/desktop`: Electron shell for the web client.
- `apps/mobile`: React Native/Expo app shell with mobile chat, voice, and
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

Verified customer custom domains work as normal server URLs. For example, once
`customer.example.com` resolves through the OpenCord ingress and the server
custom-domain mapping is active, the official web, desktop, and mobile clients
can connect to `https://customer.example.com`.
