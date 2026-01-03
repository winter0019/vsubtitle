
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
    
    TASK: Convert the provided SRT into BILINGUAL format.
    TARGET LANGUAGE: ${targetLanguage}
    
    STRICT RULES:
    1. For every subtitle entry, you MUST provide EXACTLY TWO lines of text.
    2. Line 1: The ORIGINAL text (as found in the input).
    3. Line 2: The TRANSLATED text (in ${targetLanguage}).
    4. Keep timestamps and IDs EXACTLY the same.
    5. Output ONLY raw SRT. No markdown, no explanations, no preamble.
    
    FORMAT EXAMPLE:
    1
    00:00:01,000 --> 00:00:04,000
    Hello world
    你好世界
    
    2
    00:00:04,500 --> 00:00:07,000
    This is a test
    这是一个测试
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
    throw new Error("Gemini AI failed to return a response.");
  }

  // Extract valid SRT part
  const srtMatch = rawText.match(/(\d+\s+\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}[\s\S]*)/);
  let cleanedSrt = srtMatch ? srtMatch[0] : rawText;

  cleanedSrt = cleanedSrt
    .replace(/```srt/g, '')
    .replace(/```/g, '')
    .trim();

  const finalSrt = normalizeSrt(cleanedSrt);
  
  // Basic check for bilingualism (entries should have at least 2 lines of text)
  const firstEntry = finalSrt.split('\n\n')[0];
  console.debug("Generated SRT Sample:", firstEntry);
  
  return finalSrt;
};
