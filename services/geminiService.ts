
import { GoogleGenAI, Type } from "@google/genai";
import { TranslationModel } from "../types";

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
      temperature: 0.1, // Lower temperature for more consistent formatting
    },
  });

  if (!response.text) {
    throw new Error("Failed to generate translation from Gemini.");
  }

  // Basic cleanup to ensure no markdown markers are included
  return response.text.replace(/```srt/g, '').replace(/```/g, '').trim();
};
