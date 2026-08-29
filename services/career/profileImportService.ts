import { callGeminiWithRetry, generateContentFromBackend, type FileInput } from '../geminiService';
import type { GenerateContentResponse } from '@google/genai';
import type { JobMarket, Language } from '../../types';
import {
  IMPORT_RESPONSE_SCHEMA,
  buildImportSystemInstruction,
  parseImportedProfile,
  type ImportedProfile,
} from './profileImportPrompt';

export type { ImportedProfile };

/**
 * Resume -> Career Profile extraction (strategy doc Step 1).
 *
 * The prompt, schema and parser live in profileImportPrompt.ts so the browser
 * extension reads a resume exactly the same way; this file only adds the file
 * upload path and the Gemini transport, neither of which survives in a service
 * worker.
 *
 * Demographics are deliberately NOT extracted, even when a resume states them:
 * age and gender are protected attributes and must be entered by the user on
 * purpose, not silently harvested.
 */
export async function importProfileFromResume(
  resumeInput: string | FileInput,
  targetLang: Language = 'en',
  market: JobMarket = 'AU'
): Promise<ImportedProfile> {
  const isFile = typeof resumeInput === 'object' && resumeInput !== null;

  const systemInstruction = buildImportSystemInstruction(targetLang, market);

  const parts: any[] = [{
    text: isFile
      ? 'Extract the career profile from the attached resume file.'
      : `Extract the career profile from this resume:\n\n${resumeInput as string}`,
  }];
  if (isFile) {
    const f = resumeInput as FileInput;
    parts.push({ inlineData: { mimeType: f.mimeType, data: f.data } });
  }

  const response = await callGeminiWithRetry<GenerateContentResponse>(() =>
    generateContentFromBackend({
      model: 'gemini-flash-latest',
      contents: { parts },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: IMPORT_RESPONSE_SCHEMA as any,
      },
    })
  );

  return parseImportedProfile(JSON.parse(response.text || '{}'), market);
}
