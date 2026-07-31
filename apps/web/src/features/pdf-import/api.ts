import { apiClient } from '@/lib/api-client'
import type { ParsedMatchSheet } from '@/lib/types'

export async function parseMatchPdf(file: File): Promise<ParsedMatchSheet> {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await apiClient.post<ParsedMatchSheet>('/matches/pdf-import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}
