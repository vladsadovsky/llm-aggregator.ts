#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

// Configuration - UPDATE THIS PATH to your conversations directory
const CONVERSATIONS_DIR = 'C:/Users/<user>/OneDrive/Documents/LLMAggregator';

class ConversationMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'conversation-history',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'list_threads',
          description: 'List all conversation threads with their names and item counts',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_thread',
          description: 'Get all Q&A pairs from a specific thread by thread ID',
          inputSchema: {
            type: 'object',
            properties: {
              thread_id: {
                type: 'string',
                description: 'Thread ID (e.g., thread_20260211_154708)',
              },
            },
            required: ['thread_id'],
          },
        },
        {
          name: 'search_conversations',
          description: 'Search across all conversations for specific keywords or topics',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query to find in questions and answers',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_conversation',
          description: 'Get a specific Q&A pair by its ID',
          inputSchema: {
            type: 'object',
            properties: {
              conversation_id: {
                type: 'string',
                description: 'Conversation ID (e.g., 20260211_1553)',
              },
            },
            required: ['conversation_id'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'list_threads':
            return await this.listThreads();
          case 'get_thread':
            return await this.getThread(args.thread_id);
          case 'search_conversations':
            return await this.searchConversations(args.query);
          case 'get_conversation':
            return await this.getConversation(args.conversation_id);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
        };
      }
    });
  }

  async listThreads() {
    const threadsPath = path.join(CONVERSATIONS_DIR, 'threads.json');
    const threadsData = await fs.readFile(threadsPath, 'utf-8');
    const threads = JSON.parse(threadsData);

    let result = 'Available Conversation Threads:\n\n';
    for (const [threadId, threadData] of Object.entries(threads)) {
      result += `**${threadId}**: ${threadData.name}\n`;
      result += `  - ${threadData.items.length} conversations\n\n`;
    }

    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }

  async getThread(threadId) {
    const threadsPath = path.join(CONVERSATIONS_DIR, 'threads.json');
    const threadsData = await fs.readFile(threadsPath, 'utf-8');
    const threads = JSON.parse(threadsData);

    if (!threads[threadId]) {
      throw new Error(`Thread ${threadId} not found`);
    }

    const thread = threads[threadId];
    let result = `# ${thread.name}\n\n`;

    for (const itemId of thread.items) {
      const conversation = await this.getConversationById(itemId);
      if (conversation) {
        result += conversation + '\n\n---\n\n';
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }

  async getConversation(conversationId) {
    const conversation = await this.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    return {
      content: [
        {
          type: 'text',
          text: conversation,
        },
      ],
    };
  }

  async getConversationById(conversationId) {
    const files = await glob(`${CONVERSATIONS_DIR}/${conversationId}_*.md`);
    
    if (files.length === 0) {
      return null;
    }

    const content = await fs.readFile(files[0], 'utf-8');
    return content;
  }

  async searchConversations(query) {
    const files = await glob(`${CONVERSATIONS_DIR}/*.md`);
    const results = [];

    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      const lowerContent = content.toLowerCase();
      const lowerQuery = query.toLowerCase();

      if (lowerContent.includes(lowerQuery)) {
        results.push({
          file: path.basename(file),
          content: content,
        });
      }
    }

    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No conversations found matching "${query}"`,
          },
        ],
      };
    }

    let result = `Found ${results.length} conversation(s) matching "${query}":\n\n`;
    for (const item of results) {
      result += `## ${item.file}\n\n${item.content}\n\n---\n\n`;
    }

    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Conversation History MCP server running on stdio');
  }
}

const server = new ConversationMCPServer();
server.run();