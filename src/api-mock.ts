import type { ElectronAPI, AppSettings, TagDictionary, SecretsStatus } from '../electron/preload'

/** Browser-mode stand-in: no keys stored, secure storage reported as usable. */
function mockSecretsStatus(): SecretsStatus {
    const emptyKey = { hasKey: false, maskedPreview: '', source: 'none' as const, readOnly: false }
    return {
        keys: {
            openaiApiKey: { ...emptyKey }, anthropicApiKey: { ...emptyKey },
            azureApiKey: { ...emptyKey }, selfHostedApiKey: { ...emptyKey },
        },
        warnings: [],
        backends: [
            { id: 'env', available: false, writable: false },
            { id: 'safe-storage', available: true, writable: true },
        ],
    }
}

export const mockApi: ElectronAPI = {
    settingsLoad: async () => ({
        dataDirectory: '/mock/data/dir',
        llmProvider: 'openai' as const,
        llmModel: 'gpt-4o',
        lensEnabled: false,
        tagEnforcement: 'warn' as const,
        tagSoftLimit: 50,
        tagHardLimit: 100,
        allowDevEnvSecrets: false,
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
    threadsRepairRedundant: async () => ({ threads: {}, mergedGroups: 0, removedThreadIds: [] }),
    threadsDeletePreview: async (threadIds) => ({
        token: '0'.repeat(64), threadIds, qaIdsToDelete: [], sharedQaIds: [], sharedThreadIds: [],
    }),
    threadsDeleteApply: async (threadIds, token) => ({
        token, threadIds, qaIdsToDelete: [], sharedQaIds: [], sharedThreadIds: [], threads: {}, cleanupPending: false,
    }),

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
    onArchiveLoadProgress: () => () => undefined,
    qaGet: async (_id: string) => null,
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
    importArchiveCommit: async () => ({
        createdPairs: 0,
        skippedDuplicates: 0,
        createdThreads: 0,
        reusedThreads: 0,
        failed: 0,
        threadNames: [],
        warnings: [],
        cancelled: false,
    }),
    importArchiveCancel: async () => undefined,
    onArchiveImportProgress: () => () => undefined,
    duplicatesScan: async () => ({ scanned: 0, groups: [], removableCount: 0 }),
    duplicatesDelete: async () => ({ deleted: [], failed: [], threadsUpdated: 0 }),
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
        createdAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-01-01T10:05:00.000Z',
    }),
    archiveResetPreview: async () => ({
        pairs: 0,
        threads: 0,
        tags: 0,
        hasEmbeddings: false,
        dataDirectory: '/mock/data',
    }),
    archiveReset: async () => ({
        pairsRemoved: 0,
        threadsRemoved: 0,
        tagsRemoved: 0,
        embeddingsRemoved: false,
        backupPath: '/mock/data/purged-20260101_100000',
        warnings: [],
    }),
    openExternal: async () => ({ ok: true }),
    onMenuAction: () => () => {},

    secretsLoad: async () => mockSecretsStatus(),
    secretsSave: async () => mockSecretsStatus(),
    secretsRecheck: async () => mockSecretsStatus(),
    secretsDevEnvVarNames: async () => ['LLM_AGG_OPENAI_API_KEY', 'LLM_AGG_ANTHROPIC_API_KEY'],

    searchSemantic: async () => [],

    aiGenerateMetadata: async () => null,
    aiGenerateEmbedding: async () => {},
    aiGenerateAllEmbeddings: async () => ({ total: 0, generated: 0, skipped: 0 }),
    aiTestConnection: async () => ({ ok: false, error: 'Mock mode' }),
    aiListProviders: async () => ([
        {
            id: 'openai',
            label: 'OpenAI',
            kind: 'openai',
            enabled: true,
            supportsModelDiscovery: true,
            apiKeyField: 'openaiApiKey',
        },
        {
            id: 'anthropic',
            label: 'Anthropic',
            kind: 'anthropic',
            enabled: true,
            supportsModelDiscovery: true,
            apiKeyField: 'anthropicApiKey',
            notes: 'Claude model support enabled. Embeddings are not available via Anthropic API.',
        },
    ]),
    aiListModels: async (
        providerId: string,
        _forceRefresh?: boolean,
        _apiKeyOverride?: string,
    ) => ({
        providerId,
        source: 'static' as const,
        fetchedAt: new Date().toISOString(),
        warning: providerId === 'openai' ? undefined : 'Provider runtime is not implemented yet.',
        models: providerId === 'openai' ? [
            {
                id: 'gpt-5.6-terra',
                label: 'GPT-5.6 Terra',
                providerId: 'openai',
                qualityTier: 'balanced' as const,
                costTier: 'balanced' as const,
                latencyTier: 'medium' as const,
                recommendedFor: ['balanced default'],
                notes: 'Balanced quality and cost.',
                rank: 2,
            },
            {
                id: 'gpt-4o',
                label: 'GPT-4o',
                providerId: 'openai',
                qualityTier: 'balanced' as const,
                costTier: 'balanced' as const,
                latencyTier: 'medium' as const,
                recommendedFor: ['stable general-purpose use'],
                rank: 20,
            },
        ] : [],
    }),
    aiSessionBrief: async () => '',
    aiPriorArt: async () => '',
    aiGetTokenStats: async () => ({ llm: { input: 0, output: 0 }, embeddings: { input: 0 } }),
    aiResetTokenStats: async () => {},
    aiSteelman: async () => '',
    aiQuestionSeed: async () => '',
    aiConceptSummary: async () => '',
    aiGenerateAnnotations: async () => [],
    aiApplyAnnotations: async () => {},
    aiSuggestQa: async () => ({ title: 'Suggested title', tags: ['suggested'] }),
    aiSuggestThreadTitle: async () => 'Suggested thread title',
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
