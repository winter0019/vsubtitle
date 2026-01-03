
import { GoogleGenAI } from "@google/genai";
import { TranslationModel } from "../types.ts";

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
    3. Original Text (Top line)
    4. Translated Text (Bottom line)
    5. A single blank line before the next entry
    
    Example:
    1
    00:00:01,000 --> 00:00:04,000
    Hello, how are you today?
    你好，你今天怎么样？
    
    Maintain exactly the same timestamps and entry IDs. 
    Translate contextually and naturally. 
    DO NOT include any conversational filler, markdown code blocks, or explanations. 
    Return ONLY the raw SRT text.
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

  // Robust SRT extraction: Find the first occurrence of a subtitle entry (Number + Timestamp)
  // This strips any preamble like "Here is your translation..."
  const srtMatch = rawText.match(/(\d+\s+\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}[\s\S]*)/);
  let cleanedSrt = srtMatch ? srtMatch[0] : rawText;

  // Final cleanup: remove markdown blocks if they persist and trim
  cleanedSrt = cleanedSrt
    .replace(/```srt/g, '')
    .replace(/```/g, '')
    .trim();

  return cleanedSrt;
};
