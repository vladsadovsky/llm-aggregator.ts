import { getProvider } from './llm/providerFactory'
import { getPair } from './qaPairService'
import { semanticSearch } from './embeddingService'
import { debugLog } from './logger'
import type { QAPairData } from './qaPairService'

const TOP_K = 12

// ─── Prompts ──────────────────────────────────────────────────────────────────

const SESSION_BRIEF_SYSTEM = `You are a research companion helping a researcher re-enter a topic using their own archived notes.
You will receive a set of Q&A pairs from a personal research archive. Be direct and concise.
Respond in markdown. Use exactly three sections:

## Established
What this archive has already settled or concluded on this topic. Bullet points.

## Unresolved
Questions the archive raises but does not answer, or conclusions that remain tentative. Bullet points.

## Contradictions
Claims or positions in the archive that appear to contradict each other. If none, write "None found." Bullet points.

Base your analysis strictly on the provided content. Do not add external knowledge or speculation.`

const PRIOR_ART_SYSTEM = `You are a research companion helping a researcher avoid re-covering ground they have already explored.
You will receive a query and a set of Q&A pairs from a personal research archive.
Respond in markdown. Use exactly two sections:

## Already Covered
A compact summary of what the archive already knows about this query. Bullet points. Be specific — cite the relevant QA titles where helpful.

## Gaps
What the query touches on that the archive has NOT addressed or that remains genuinely open. Bullet points.

Base your analysis strictly on the provided content. Do not add external knowledge.`

const STEELMAN_SYSTEM = `You are a research companion helping a researcher examine both sides of a position using their own archived notes.
You will receive a hypothesis or claim and a set of Q&A pairs from a personal research archive.
Respond in markdown. Use exactly two sections:

## Supporting Evidence
Archive entries that support, corroborate, or are consistent with the hypothesis. For each, quote or closely paraphrase the relevant claim and cite the entry title. Bullet points.

## Challenging Evidence
Archive entries that contradict, complicate, or put pressure on the hypothesis. For each, explain the tension specifically. Bullet points. If none, write "None found in this archive."

Base your analysis strictly on the provided content. Do not add external knowledge.`

const QUESTION_SEED_SYSTEM = `You are a research companion helping a researcher identify the frontier of their own thinking.
You will receive a focus topic and a set of Q&A pairs from a personal research archive.
Your task: identify questions that the archive RAISES but does NOT answer — gaps in the argument, unexamined assumptions, things mentioned in passing but never developed, implicit contradictions that deserve investigation.

Respond in markdown. Output a numbered list of 5–8 questions only. Each question should be:
- Grounded in something actually present in the archive (not invented)
- Genuinely open — not already answered in the provided entries
- Specific enough to be actionable in a single research session

Do not explain the questions. Just list them. No preamble.`

const CONCEPT_SUMMARY_SYSTEM = `You are a research companion helping a researcher synthesize their own understanding of a concept from archived notes.
You will receive a concept name and all Q&A pairs from the archive that touch on it.
Respond in markdown. Use exactly four sections:

## Working Model
The researcher's current best understanding of this concept based on the archive. 2–4 sentences.

## Known Limitations
What the archive acknowledges as uncertain, incomplete, or problematic about this model. Bullet points.

## Open Questions
Questions that remain genuinely unresolved in the archive regarding this concept. Bullet points.

## Abandoned Directions
Approaches or framings the archive appears to have explored and moved away from. If none are evident, write "None identified." Bullet points.

Base your synthesis strictly on the provided content. Do not add external knowledge.`

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatContext(pairs: QAPairData[]): string {
  return pairs
    .map(
      (p, i) =>
        `### [${i + 1}] ${p.title}\n**Question:** ${p.question}\n\n**Answer:** ${p.answer}`,
    )
    .join('\n\n---\n\n')
}

function noEmbeddingsMessage(): string {
  return '_No related entries found. Run **Generate all embeddings** in Settings → AI first, then try again._'
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function sessionBriefing(topic: string): Promise<string> {
  debugLog('insightsService', 'sessionBriefing for topic:', topic)

  const ids = await semanticSearch(topic, TOP_K)
  if (ids.length === 0) return noEmbeddingsMessage()

  const pairs = ids.map((id) => getPair(id)).filter((p): p is QAPairData => p !== null)
  if (pairs.length === 0) return noEmbeddingsMessage()

  const context = formatContext(pairs)
  const userPrompt = `Topic I am about to work on: "${topic}"\n\nRelevant archive entries:\n\n${context}`

  const provider = getProvider()
  return provider.complete(userPrompt, SESSION_BRIEF_SYSTEM)
}

export async function priorArtCheck(query: string): Promise<string> {
  debugLog('insightsService', 'priorArtCheck for query:', query)

  const ids = await semanticSearch(query, TOP_K)
  if (ids.length === 0) return noEmbeddingsMessage()

  const pairs = ids.map((id) => getPair(id)).filter((p): p is QAPairData => p !== null)
  if (pairs.length === 0) return noEmbeddingsMessage()

  const context = formatContext(pairs)
  const userPrompt = `Query: "${query}"\n\nRelevant archive entries:\n\n${context}`

  const provider = getProvider()
  return provider.complete(userPrompt, PRIOR_ART_SYSTEM)
}

export async function steelmanRetrieval(hypothesis: string): Promise<string> {
  debugLog('insightsService', 'steelmanRetrieval for:', hypothesis)

  const ids = await semanticSearch(hypothesis, TOP_K)
  if (ids.length === 0) return noEmbeddingsMessage()

  const pairs = ids.map((id) => getPair(id)).filter((p): p is QAPairData => p !== null)
  if (pairs.length === 0) return noEmbeddingsMessage()

  const context = formatContext(pairs)
  const userPrompt = `Hypothesis: "${hypothesis}"\n\nArchive entries to analyze:\n\n${context}`

  const provider = getProvider()
  return provider.complete(userPrompt, STEELMAN_SYSTEM)
}

export async function questionSeeding(topic: string): Promise<string> {
  debugLog('insightsService', 'questionSeeding for:', topic)

  const ids = await semanticSearch(topic, TOP_K)
  if (ids.length === 0) return noEmbeddingsMessage()

  const pairs = ids.map((id) => getPair(id)).filter((p): p is QAPairData => p !== null)
  if (pairs.length === 0) return noEmbeddingsMessage()

  const context = formatContext(pairs)
  const userPrompt = `Focus topic: "${topic}"\n\nArchive entries:\n\n${context}`

  const provider = getProvider()
  return provider.complete(userPrompt, QUESTION_SEED_SYSTEM)
}

export async function conceptStateSummary(concept: string): Promise<string> {
  debugLog('insightsService', 'conceptStateSummary for:', concept)

  // Use a larger pool for concept summary — we want broader coverage
  const ids = await semanticSearch(concept, 20)
  if (ids.length === 0) return noEmbeddingsMessage()

  const pairs = ids.map((id) => getPair(id)).filter((p): p is QAPairData => p !== null)
  if (pairs.length === 0) return noEmbeddingsMessage()

  const context = formatContext(pairs)
  const userPrompt = `Concept: "${concept}"\n\nArchive entries touching this concept:\n\n${context}`

  const provider = getProvider()
  return provider.complete(userPrompt, CONCEPT_SUMMARY_SYSTEM)
}
