
import { GoogleGenAI } from "@google/genai";
import { TranslationModel } from "../types.ts";

/**
 * Normalizes SRT content to ensure it strictly follows the standard format.
 * Fixes missing indices, inconsistent line breaks, and trailing spaces.
 */
const normalizeSrt = (content: string): string => {
  const entries = content.trim().split(/\n\s*\n/);
  return entries.map((entry, index) => {
    const lines = entry.trim().split('\n');
    // Ensure the first line is the index
    const timestampLineIndex = lines.findIndex(l => l.includes(' --> '));
    if (timestampLineIndex === -1) return ''; // Skip malformed entries

    const timestamps = lines[timestampLineIndex];
    const textLines = lines.slice(timestampLineIndex + 1);
    
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
    You are a professional subtitle translator.
    Task: Translate the provided SRT content into ${targetLanguage}.
    
    CRITICAL REQUIREMENT: Output MUST be in BILINGUAL SRT format.
    Structure for each subtitle entry:
    1. Entry Number
    2. Timestamp (00:00:00,000 --> 00:00:00,000)
    3. Original Text (Line 1)
    4. Translated Text (Line 2)
    5. Exactly one blank line before next entry
    
    Maintain exactly the same timestamps and entry IDs. 
    Translate contextually and naturally. 
    Return ONLY the raw SRT text without any preamble or code blocks.
  `;

  const response = await ai.models.generateContent({
    model: modelName,
    contents: srtContent,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.1,
    },
  });

  const rawText = response.text;
  if (!rawText) {
    throw new Error("Failed to generate translation from Gemini.");
  }

  // Extract valid SRT part
  const srtMatch = rawText.match(/(\d+\s+\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}[\s\S]*)/);
  let cleanedSrt = srtMatch ? srtMatch[0] : rawText;

  cleanedSrt = cleanedSrt
    .replace(/```srt/g, '')
    .replace(/```/g, '')
    .trim();

  // Apply strict normalization
  return normalizeSrt(cleanedSrt);
};
