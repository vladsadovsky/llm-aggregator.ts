import { searchPairs } from './qaPairService'

export function search(query: string, type: 'full-text' | 'tags'): string[] {
  return searchPairs(query, type)
}
