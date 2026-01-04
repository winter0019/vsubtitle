
import { GoogleGenAI } from "@google/genai";
import { TranslationModel } from "../types.ts";

/**
 * Standardizes SRT format for FFmpeg compatibility.
 * Ensures double-newline separation and trims whitespace from individual blocks.
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
    You are a professional bilingual subtitle translator.
    
    TASK:
    Convert the provided English SRT into a BILINGUAL version.
    
    STRICT RULES:
    1. For every block, keep the original English line.
    2. Add the translated ${targetLanguage} line immediately below it.
    3. Maintain ALL IDs and timestamps exactly as provided (00:00:00,000 --> 00:00:00,000).
    4. Do not remove blank lines between subtitle blocks.
    5. Output RAW SRT content ONLY.
    6. Absolutely NO markdown code blocks (no \`\`\`), no titles, and no explanations.
    
    EXAMPLE OUTPUT:
    1
    00:00:01,000 --> 00:00:03,000
    This is a test.
    这是一个测试。
  `;

  const response = await ai.models.generateContent({
    model: modelName,
    contents: srtContent,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.1, // Lower temperature for more consistent formatting
      topP: 0.95,
    },
  });

  let rawText = response.text || "";
  
  // Robust cleaning: Strip markdown code fences (even with language hints) and trim
  rawText = rawText
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/```/g, "")
    .trim();

  // If the AI output is completely empty or garbage, we fall back to the original content
  if (!rawText || !rawText.includes('-->')) {
    console.error("Gemini failed to return valid SRT. Returning original content.");
    return normalizeSrt(srtContent);
  }

  return normalizeSrt(rawText);
};
