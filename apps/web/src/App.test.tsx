import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'

describe('OpenCord web shell', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', version: 'test-version' }),
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the server selector and reports API health', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'OpenCord' })).toBeInTheDocument()
    expect(screen.getByLabelText('Server URL')).toHaveValue('http://localhost:8080')

    await waitFor(() => {
      expect(screen.getByText('API online')).toBeInTheDocument()
    })

    expect(screen.getByText('test-version')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/healthz', {
      headers: { Accept: 'application/json' },
    })
  })

  it('checks another compatible server when the URL changes', async () => {
    render(<App />)

    await userEvent.clear(screen.getByLabelText('Server URL'))
    await userEvent.type(screen.getByLabelText('Server URL'), 'https://chat.example.com/')
    await userEvent.click(screen.getByRole('button', { name: 'Check server' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith('https://chat.example.com/healthz', {
        headers: { Accept: 'application/json' },
      })
    })
  })
})
