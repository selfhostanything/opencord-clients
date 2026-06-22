import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import './App.css'

type HealthState =
  | { status: 'checking' }
  | { status: 'online'; version: string }
  | { status: 'offline'; message: string }

const DEFAULT_SERVER_URL = 'http://localhost:8080'

function healthURL(serverURL: string) {
  return `${serverURL.replace(/\/+$/, '')}/healthz`
}

async function fetchHealth(serverURL: string): Promise<HealthState> {
  const response = await fetch(healthURL(serverURL), {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    return { status: 'offline', message: `HTTP ${response.status}` }
  }

  const payload = (await response.json()) as { status?: string; version?: string }
  if (payload.status !== 'ok') {
    return { status: 'offline', message: 'Health response was not ok' }
  }

  return { status: 'online', version: payload.version ?? 'unknown' }
}

export default function App() {
  const [serverURL, setServerURL] = useState(DEFAULT_SERVER_URL)
  const [health, setHealth] = useState<HealthState>({ status: 'checking' })

  async function checkServer(targetURL = serverURL) {
    setHealth({ status: 'checking' })
    try {
      setHealth(await fetchHealth(targetURL))
    } catch (error) {
      setHealth({
        status: 'offline',
        message: error instanceof Error ? error.message : 'Unable to reach server',
      })
    }
  }

  useEffect(() => {
    void checkServer(DEFAULT_SERVER_URL)
  }, [])

  function submitServer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void checkServer(serverURL)
  }

  return (
    <main className="app-shell">
      <aside className="server-rail" aria-label="Servers">
        <div className="server-mark" aria-hidden="true">
          OC
        </div>
        <div className="server-dot is-active" aria-hidden="true" />
        <div className="server-dot" aria-hidden="true" />
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Official multi-server client</p>
            <h1>OpenCord</h1>
          </div>
          <StatusBadge health={health} />
        </header>

        <div className="content-grid">
          <form className="connection-panel" onSubmit={submitServer}>
            <label htmlFor="server-url">Server URL</label>
            <div className="server-form-row">
              <input
                id="server-url"
                name="server-url"
                type="url"
                value={serverURL}
                onChange={(event) => setServerURL(event.target.value)}
              />
              <button type="submit">Check server</button>
            </div>
            <p>
              Connect this official web client to a self-hosted or OpenCord Cloud server.
              Identity stays scoped to the selected server.
            </p>
          </form>

          <section className="preview-panel" aria-label="Client shell preview">
            <div className="channel-list">
              <div className="section-label">Spaces</div>
              <div className="channel-row is-selected"># foundation</div>
              <div className="channel-row"># architecture</div>
              <div className="channel-row"># phase-00</div>
            </div>
            <div className="message-pane">
              <div className="message-line strong">Phase 00 shell</div>
              <div className="message-line">Health and discovery checks are ready.</div>
              <div className="message-line muted">Chat features start in Phase 01.</div>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}

function StatusBadge({ health }: { health: HealthState }) {
  if (health.status === 'checking') {
    return <div className="status-badge is-checking">Checking API</div>
  }

  if (health.status === 'online') {
    return (
      <div className="status-badge is-online">
        <span>API online</span>
        <strong>{health.version}</strong>
      </div>
    )
  }

  return (
    <div className="status-badge is-offline">
      <span>API offline</span>
      <strong>{health.message}</strong>
    </div>
  )
}
