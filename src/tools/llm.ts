import { google } from '@ai-sdk/google';
import { type LanguageModel } from 'ai';

export const llm: LanguageModel = google('gemini-2.5-pro-preview-05-06');