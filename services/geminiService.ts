
import { GoogleGenAI } from "@google/genai";
import { TranslationModel } from "../types.ts";

/**
 * Normalizes SRT content to ensure it strictly follows the standard format.
 */
const normalizeSrt = (content: string): string => {
  const entries = content.trim().split(/\n\s*\n/);
  return entries.map((entry, index) => {
    const lines = entry.trim().split('\n');
    const timestampLineIndex = lines.findIndex(l => l.includes(' --> '));
    if (timestampLineIndex === -1) return ''; 

    const timestamps = lines[timestampLineIndex];
    const textLines = lines.slice(timestampLineIndex + 1);
    
    // Ensure we have at least one line of text
    if (textLines.length === 0) return '';

    // Join with simple newlines - FFmpeg's libass handles these correctly
    return `${index + 1}\n${timestamps}\n${textLines.join('\n')}\n`;
  }).filter(Boolean).join('\n');
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
    
    STRICT FORMATTING RULES:
    1. For EVERY entry, you must output exactly:
       Line 1: The original English text.
       Line 2: The translated ${targetLanguage} text.
    2. Do not merge lines into one. Keep them separate.
    3. Keep timestamps (00:00:00,000 --> 00:00:00,000) and IDs exactly as provided.
    4. Return ONLY the raw SRT content. No markdown code blocks (no \`\`\`), no titles, no explanations.
    
    EXAMPLE:
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
  
  // Strip any accidental Markdown formatting
  rawText = rawText.replace(/```[a-z]*\n/g, '').replace(/```/g, '').trim();

  // If Gemini failed to return a valid starting ID, just return what we have (cleaned)
  if (!rawText.match(/^\d+/)) {
     console.warn("Gemini output might be malformed, attempting to fix...");
  }

  const finalSrt = normalizeSrt(rawText);
  return finalSrt;
};
