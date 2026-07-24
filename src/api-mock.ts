import type { ElectronAPI, QAPairData, AppSettings, TagDictionary } from '../electron/preload'

export const mockApi: ElectronAPI = {
    settingsLoad: async () => ({
        dataDirectory: '/mock/data/dir',
        llmProvider: 'openai' as const,
        llmModel: 'gpt-4o',
        tagEnforcement: 'warn' as const,
        tagSoftLimit: 50,
        tagHardLimit: 100,
    }),
    settingsSave: async (settings: AppSettings) => {
        console.log('Mock: Saving settings', settings)
    },
    settingsPickDirectory: async () => '/mock/picked/dir',

    threadsLoad: async () => ({
        'thread-1': {
            name: 'Welcome Thread',
            items: ['qa-1', 'qa-2'],
        },
    }),
    threadsSave: async (threads) => {
        console.log('Mock: Saving threads', threads)
    },

    qaListAll: async () => ({
        'qa-1': {
            id: 'qa-1',
            filepath: '/mock/path/1.md',
            title: 'What is this app?',
            source: 'Internal',
            url: '',
            tags: ['intro', 'help'],
            timestamp: new Date().toISOString(),
            version: 1,
            threadPairs: [{ thread_id: 'thread-1', order: 0 }],
            question: 'What is the LLM Aggregator?',
            answer: 'It is a tool to organize and search your LLM conversation Q&A pairs.',
        },
        'qa-2': {
            id: 'qa-2',
            filepath: '/mock/path/2.md',
            title: 'How to use it?',
            source: 'Internal',
            url: '',
            tags: ['guide'],
            timestamp: new Date().toISOString(),
            version: 1,
            threadPairs: [{ thread_id: 'thread-1', order: 1 }],
            question: 'How do I add new pairs?',
            answer: 'You can use the "New Q&A" button in the sidebar.',
        },
    }),
    qaGet: async (id: string) => null,
    qaCreate: async (data) => ({
        id: 'qa-' + Math.random().toString(36).substr(2, 9),
        filepath: '',
        title: data.title,
        source: data.source,
        url: data.url,
        tags: data.tags,
        timestamp: new Date().toISOString(),
        version: 1,
        threadPairs: [],
        question: data.question,
        answer: data.answer,
    }),
    qaUpdate: async (id, data) => ({
        id,
        filepath: '',
        title: data.title || '',
        source: data.source || '',
        url: data.url || '',
        tags: data.tags || [],
        timestamp: new Date().toISOString(),
        version: 1,
        threadPairs: [],
        question: data.question || '',
        answer: data.answer || '',
    }),
    qaDelete: async (id) => {
        console.log('Mock: Deleting QA pair', id)
    },

    searchQuery: async (query, type) => {
        console.log('Mock: Searching', query, type)
        return ['qa-1']
    },

    exportQA: async (_id) => null,
    exportThread: async (_threadId) => null,
    importFromFile: async () => null,
    importSharedLink: async (url: string) => ({
        provider: 'chatgpt' as const,
        url,
        model: 'gpt-4o',
        threadName: 'Mock Imported Conversation',
        titleWasDerived: false,
        tags: ['chatgpt', 'gpt-4o'],
        items: [
            {
                data: {
                    title: 'Mock question',
                    source: 'chatgpt',
                    url,
                    tags: ['chatgpt', 'gpt-4o'],
                    question: 'What is this?',
                    answer: 'A mocked imported answer.',
                },
                warnings: [],
            },
        ],
        warnings: [],
    }),

    secretsLoad: async () => ({ openaiApiKey: '', anthropicApiKey: '' }),
    secretsSave: async () => {},

    searchSemantic: async () => [],

    aiGenerateMetadata: async () => null,
    aiGenerateEmbedding: async () => {},
    aiGenerateAllEmbeddings: async () => ({ total: 0, generated: 0, skipped: 0 }),
    aiTestConnection: async () => ({ ok: false, error: 'Mock mode' }),
    aiSessionBrief: async () => '',
    aiPriorArt: async () => '',
    aiGetTokenStats: async () => ({ llm: { input: 0, output: 0 }, embeddings: { input: 0 } }),
    aiResetTokenStats: async () => {},
    aiSteelman: async () => '',
    aiQuestionSeed: async () => '',
    aiConceptSummary: async () => '',
    aiGenerateAnnotations: async () => [],
    aiApplyAnnotations: async () => {},
    tagsLoad: async (): Promise<TagDictionary> => ({ version: 1, tags: {} }),
    tagsSave: async () => {},
    tagsAdd: async () => {},
    tagsRemove: async () => {},
    tagsRename: async () => {},
    tagsAddAlias: async () => {},
    tagsRemoveAlias: async () => {},
    tagsResolve: async () => null,
    tagsSync: async () => ({ added: [] }),

    archiveHealthCheck: async () => ({
        totalPairs: 0,
        orphanIds: [],
        metadataGaps: { missingTopic: [], missingSummary: [], missingConfidence: [] },
        duplicateCandidates: [],
        deadEndCandidates: [],
    }),
}
