
import { GoogleGenAI } from "@google/genai";
import { TranslationModel } from "../types.ts";

/**
 * Ensures SRT content follows standard line-break conventions.
 */
const normalizeSrt = (content: string): string => {
  // Trim and ensure standard double-newline spacing between blocks
  return content
    .trim()
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .join('\n\n') + '\n\n';
};

export const translateSubtitles = async (
  srtContent: string,
  targetLanguage: string,
  modelName: TranslationModel = TranslationModel.GEMINI_FLASH
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const systemPrompt = `
    You are an expert bilingual subtitle translator.
    
    TASK: Convert the provided SRT into a BILINGUAL format.
    TARGET LANGUAGE: ${targetLanguage}
    
    STRICT RULES:
    1. For every entry, output the original English line, then the translated line immediately below it.
    2. Keep ALL timestamps and IDs exactly the same.
    3. Output RAW SRT ONLY. No markdown, no explanations.
    
    Example Output Format:
    1
    00:00:01,000 --> 00:00:04,000
    Hello world
    你好世界
  `;

  const response = await ai.models.generateContent({
    model: modelName,
    contents: srtContent,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.1,
    },
  });

  let rawText = response.text || "";
  
  // Strip code blocks if AI included them
  rawText = rawText.replace(/```[a-z]*\n/g, '').replace(/```/g, '').trim();

  return normalizeSrt(rawText);
};
