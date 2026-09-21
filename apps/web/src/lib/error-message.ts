import { isAxiosError } from 'axios'

/** The most useful sentence we can give for a failed request: the server's own explanation
 * when it sent one (the API answers in French), a network hint when the request never
 * reached it, otherwise the caller's generic fallback. */
export function errorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    if (!error.response) return 'Connexion impossible — vérifie ton réseau et réessaie.'
    const data: unknown = error.response.data
    if (data && typeof data === 'object' && 'message' in data) {
      const message = (data as { message: unknown }).message
      if (Array.isArray(message)) return message.map(String).join(' · ')
      if (typeof message === 'string' && message.length > 0) return message
    }
    if (error.response.status === 403) return "Tu n'as pas les droits pour faire ça."
    if (error.response.status >= 500) return 'Le serveur a rencontré un problème — réessaie dans un instant.'
  }
  return fallback
}
