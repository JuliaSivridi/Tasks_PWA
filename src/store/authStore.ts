import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  name: string
  email: string
  picture: string
}

interface AuthState {
  user: User | null
  accessToken: string | null
  tokenExpiry: number | null
  isAuthenticated: boolean
  spreadsheetId: string
  setToken: (token: string, expiresIn: number) => void
  setUser: (user: User) => void
  setSpreadsheetId: (id: string) => void
  refreshToken: () => Promise<void>
  logout: () => void
}

// GIS token client instance (set by authService)
let _tokenClient: google.accounts.oauth2.TokenClient | null = null

export function setTokenClient(client: google.accounts.oauth2.TokenClient): void {
  _tokenClient = client
}

// Pending promise handlers for token request
let _pendingResolve: (() => void) | null = null
let _pendingReject: ((err: Error) => void) | null = null

export function resolveTokenRequest(token: string, expiresIn: number): void {
  useAuthStore.getState().setToken(token, expiresIn)
  _pendingResolve?.()
  _pendingResolve = null
  _pendingReject = null
}

export function rejectTokenRequest(error: string): void {
  _pendingReject?.(new Error(error))
  _pendingResolve = null
  _pendingReject = null
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      tokenExpiry: null,
      isAuthenticated: false,
      spreadsheetId: '',

      setToken: (token, expiresIn) => {
        set({
          accessToken: token,
          tokenExpiry: Date.now() + expiresIn * 1000,
          isAuthenticated: true,
        })
      },

      setUser: (user) => {
        set({ user })
      },

      setSpreadsheetId: (id) => {
        set({ spreadsheetId: id })
      },

      refreshToken: () =>
        new Promise<void>((resolve, reject) => {
          if (!_tokenClient) {
            reject(new Error('Token client not initialized'))
            return
          }
          _pendingResolve = resolve
          _pendingReject = reject
          // prompt: '' = silent refresh if possible, otherwise shows consent
          _tokenClient.requestAccessToken({ prompt: '' })
        }),

      logout: () => {
        const token = get().accessToken
        if (token && window.google?.accounts?.oauth2) {
          window.google.accounts.oauth2.revoke(token, () => {})
        }
        set({ user: null, accessToken: null, tokenExpiry: null, isAuthenticated: false })
      },
    }),
    {
      name: 'auth-storage',
      // Persist token so the user doesn't have to log in on every refresh.
      // Trade-off: XSS risk — acceptable for a personal single-user tool.
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        tokenExpiry: state.tokenExpiry,
        spreadsheetId: state.spreadsheetId,
      }),
    },
  ),
)
