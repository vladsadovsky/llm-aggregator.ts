import { listAllPairs } from './qaPairService'

export function search(query: string, type: 'full-text' | 'tags'): string[] {
  const pairs = listAllPairs()
  const lowerQuery = query.toLowerCase()

  const results: string[] = []

  for (const [id, pair] of Object.entries(pairs)) {
    if (type === 'tags') {
      const matchesTags = pair.tags.some((tag) =>
        tag.toLowerCase().includes(lowerQuery)
      )
      if (matchesTags) {
        results.push(id)
      }
    } else {
      // full-text: search in question, answer, and title
      const text = `${pair.title} ${pair.question} ${pair.answer}`.toLowerCase()
      if (text.includes(lowerQuery)) {
        results.push(id)
      }
    }
  }

  return results
}
