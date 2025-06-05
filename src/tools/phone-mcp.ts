/* eslint-disable no-duplicate-imports */
import type { ToolSet } from 'ai';
import { experimental_createMCPClient as createMCPClient } from 'ai';
import { Experimental_StdioMCPTransport as StdioMCPTransport } from 'ai/mcp-stdio';
import { z } from 'zod';

/**
 * MCP Tools Schema Definitions
 * Explicit schema definition for type safety and AI SDK compatibility
 */
export const mcpToolSchemas = {
  // Device Management
  'check_device_connection': {
    parameters: z.object({
      random_string: z.string().optional().describe('Dummy parameter for no-parameter tools'),
    }),
  },

  // App Management  
  'launch_app_activity': {
    parameters: z.object({
      package_name: z.string().describe('The package name of the app to launch (e.g., "com.android.contacts")'),
      activity_name: z.string().optional().describe('The specific activity to launch. If not provided, launches the app\'s main activity'),
    }),
  },

  'list_installed_apps': {
    parameters: z.object({
      only_system: z.string().optional().default('false').describe('If True, only show system apps'),
      only_third_party: z.string().optional().default('false').describe('If True, only show third-party apps'), 
      page: z.string().optional().default('1').describe('Page number (starts from 1)'),
      page_size: z.string().optional().default('10').describe('Number of items per page'),
      basic: z.string().optional().default('true').describe('If True, only return basic info (faster loading)'),
    }),
  },

  'terminate_app': {
    parameters: z.object({
      package_name: z.string().describe('Package name of the app to terminate'),
    }),
  },

  'get_current_window': {
    parameters: z.object({
      random_string: z.string().optional().describe('Dummy parameter for no-parameter tools'),
    }),
  },

  // Screen Interaction
  'analyze_screen': {
    parameters: z.object({
      include_screenshot: z.boolean().optional().default(false).describe('Whether to include base64-encoded screenshot in the result'),
      max_elements: z.number().optional().default(50).describe('Maximum number of UI elements to process'),
    }),
  },

  'interact_with_screen': {
    parameters: z.object({
      action: z.enum(['tap', 'swipe', 'key', 'text', 'find', 'wait', 'scroll']).describe('Action type to perform'),
      params: z.object({
        // Tap action
        x: z.number().optional().describe('X coordinate to tap'),
        y: z.number().optional().describe('Y coordinate to tap'),
        
        // Swipe action
        x1: z.number().optional().describe('Start X coordinate for swipe'),
        y1: z.number().optional().describe('Start Y coordinate for swipe'),
        x2: z.number().optional().describe('End X coordinate for swipe'),
        y2: z.number().optional().describe('End Y coordinate for swipe'),
        duration: z.number().optional().describe('Swipe duration in ms, defaults to 300'),
        
        // Key action
        keycode: z.string().optional().describe('Key to press (e.g., "back", "home", "enter", or keycode number)'),
        
        // Text action
        content: z.string().optional().describe('Text to input. For Chinese characters, use pinyin instead'),
        
        // Find/Wait/Scroll actions
        method: z.enum(['text', 'id', 'content_desc', 'class', 'clickable']).optional().describe('Search method'),
        value: z.string().optional().describe('Text/value to search for'),
        partial: z.boolean().optional().describe('Use partial matching, defaults to True'),
        timeout: z.number().optional().describe('Maximum wait time in seconds, defaults to 30'),
        interval: z.number().optional().describe('Check interval in seconds, defaults to 1.0'),
        direction: z.enum(['up', 'down', 'left', 'right']).optional().describe('Scroll direction, defaults to "down"'),
        max_swipes: z.number().optional().describe('Maximum swipe attempts, defaults to 5'),
      }).describe('Action parameters'),
    }),
  },

  // Communication
  'call_number': {
    parameters: z.object({
      number: z.string().describe('The phone number to call. Country code will be automatically added if not provided'),
    }),
  },

  'end_call': {
    parameters: z.object({
      random_string: z.string().optional().describe('Dummy parameter for no-parameter tools'),
    }),
  },

  'send_text_message': {
    parameters: z.object({
      number: z.string().describe('Recipient\'s phone number. Country code will be automatically added if not included'),
      message: z.string().describe('SMS content. Supports any text, including emojis'),
    }),
  },

  'receive_text_messages': {
    parameters: z.object({
      limit: z.number().optional().default(5).describe('Maximum number of messages to retrieve'),
    }),
  },

  'get_sent_messages': {
    parameters: z.object({
      limit: z.number().optional().default(5).describe('Maximum number of sent messages to retrieve'),
    }),
  },

  // Contacts
  'get_contacts': {
    parameters: z.object({
      limit: z.string().optional().default('20').describe('Number of contacts to retrieve'),
    }),
  },

  'create_contact': {
    parameters: z.object({
      name: z.string().describe('The contact\'s full name'),
      number: z.string().describe('The contact\'s phone number (For testing, 10086 is recommended)'),
      email: z.string().optional().describe('The contact\'s email address'),
    }),
  },

  // Media & System
  'start_screen_recording': {
    parameters: z.object({
      duration_seconds: z.number().optional().default(30).describe('Recording duration in seconds (default: 30, max: 180)'),
    }),
  },

  'play_media': {
    parameters: z.object({
      random_string: z.string().optional().describe('Dummy parameter for no-parameter tools'),
    }),
  },

  'set_alarm': {
    parameters: z.object({
      hour: z.number().describe('Hour in 24-hour format (0-23)'),
      minute: z.number().describe('Minute (0-59)'),
      label: z.string().optional().default('Alarm').describe('Optional label for the alarm'),
    }),
  },

  'receive_incoming_call': {
    parameters: z.object({
      random_string: z.string().optional().describe('Dummy parameter for no-parameter tools'),
    }),
  },

  'open_url': {
    parameters: z.object({
      url: z.string().describe('URL to open'),
    }),
  },

  'get_app_shortcuts': {
    parameters: z.object({
      package_name: z.string().optional().describe('Specific app package to get shortcuts for'),
    }),
  },

  'mcp_monitor_ui_changes': {
    parameters: z.object({
      interval_seconds: z.number().optional().default(1).describe('Time between UI checks (seconds)'),
      max_duration_seconds: z.number().optional().default(60).describe('Maximum monitoring time (seconds)'),
      watch_for: z.string().optional().default('any_change').describe('What to watch for - "any_change", "text_appears", "text_disappears", etc.'),
      target_text: z.string().optional().default('').describe('Text to watch for (when watch_for includes "text")'),
      target_id: z.string().optional().default('').describe('ID to watch for (when watch_for includes "id")'),
      target_class: z.string().optional().default('').describe('Class to watch for (when watch_for includes "class")'),
      target_content_desc: z.string().optional().default('').describe('Content description to watch for'),
    }),
  },
};

/**
 * Get MCP Tools with proper schemas for AI SDK
 */
export async function getMCPToolsWithSchemas(): Promise<ToolSet> {
  const mcpClient = await createMCPClient({
    transport: new StdioMCPTransport({
      command: 'uvx',
      args: ['phone-mcp'],
    }),
  });
  

  const tools = await mcpClient.tools({
    schemas: mcpToolSchemas,
  });

  console.log(`✅ MCP tools loaded: ${Object.keys(tools).join(', ')}`);

  return tools;
}
