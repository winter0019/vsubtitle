
import { GoogleGenAI } from "@google/genai";
import { TranslationModel } from "../types.ts";

/**
 * Standardizes SRT format for FFmpeg compatibility.
 */
const normalizeSrt = (content: string): string => {
  return content
    .trim()
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(block => block.length > 0)
    .join('\n\n') + '\n\n';
};

/**
 * Translates English subtitles into a bilingual format using Gemini AI.
 */
export const translateSubtitles = async (
  srtContent: string,
  targetLanguage: string,
  modelName: TranslationModel = TranslationModel.GEMINI_FLASH
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const systemPrompt = `
    You are a professional subtitle translator and formatting expert.
    
    TASK:
    Convert the provided English SRT into a BILINGUAL version.
    
    STRICT RULES:
    1. For every entry, you MUST preserve the original English text on Line 1.
    2. You MUST add the accurate ${targetLanguage} translation on Line 2 immediately below it.
    3. Keep IDs (1, 2, 3...) and timestamps (00:00:00,000 --> 00:00:00,000) EXACTLY unchanged.
    4. Do not remove blank lines between subtitle blocks.
    5. Output RAW SRT content ONLY. 
    6. NO markdown code blocks (\`\`\`), NO explanations, NO extra whitespace.
    
    Example Output:
    1
    00:00:01,000 --> 00:00:03,000
    Hello, how are you?
    你好，你最近怎么样？
  `;

  // Using the corrected structure for generateContent
  const response = await ai.models.generateContent({
    model: modelName,
    contents: [{ role: "user", parts: [{ text: srtContent }] }],
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.1,
    },
  });

  let rawText = response.text || "";
  
  // Clean potential markdown fences
  rawText = rawText
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/```/g, "")
    .trim();

  // Basic validation check
  if (!rawText || !rawText.includes('-->')) {
    console.error("Gemini output invalid SRT. Falling back to original.");
    return normalizeSrt(srtContent);
  }

  return normalizeSrt(rawText);
};
