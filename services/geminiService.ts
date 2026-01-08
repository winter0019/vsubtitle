
import { GoogleGenAI } from "@google/genai";
import { TranslationModel } from "../types.ts";

/**
 * Sanitizes AI output to ensure it is valid SRT.
 */
const cleanSrtOutput = (text: string): string => {
  return text
    .replace(/```[a-z]*\n?/gi, "") // Remove markdown blocks
    .replace(/```/g, "")
    .replace(/^\s+/, "")
    .trim() + '\n\n';
};

/**
 * Translates English subtitles into a high-quality bilingual format using Gemini.
 */
export const translateSubtitles = async (
  srtContent: string,
  targetLanguage: string,
  modelName: TranslationModel = TranslationModel.GEMINI_FLASH
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const systemInstruction = `
    You are a professional subtitle translator. 
    TASK: Convert the provided English SRT into a BILINGUAL version for high-quality video production.
    
    STRICT FORMATTING RULES:
    1. Line 1: Keep the original English text EXACTLY as is.
    2. Line 2: Provide an accurate, natural translation in ${targetLanguage}.
    3. DO NOT change timestamps or IDs.
    4. Ensure there is exactly one blank line between each subtitle block.
    5. Output ONLY the raw SRT content. No markdown, no notes, no commentary.
    
    EXAMPLE:
    1
    00:00:01,000 --> 00:00:03,000
    Hello world!
    你好，世界！
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts: [{ text: srtContent }] }],
      config: {
        systemInstruction,
        temperature: 0.1, // High precision
      },
    });

    const result = response.text || "";
    if (!result.includes('-->')) {
      throw new Error("Invalid SRT structure from Gemini");
    }

    return cleanSrtOutput(result);
  } catch (error) {
    console.error("Translation Error:", error);
    throw new Error("Failed to translate subtitles. Please try again.");
  }
};
