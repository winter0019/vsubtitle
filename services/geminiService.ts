
import { GoogleGenAI } from "@google/genai";
import { TranslationModel } from "../types.ts";

/**
 * Sanitizes AI output to ensure it is valid ASS content.
 */
const cleanAssOutput = (text: string): string => {
  return text
    .replace(/```[a-z]*\n?/gi, "") // Remove markdown blocks
    .replace(/```/g, "")
    .replace(/^\s+/, "")
    .trim();
};

/**
 * Translates subtitles into a high-quality bilingual ASS format using Gemini.
 */
export const translateSubtitles = async (
  srtContent: string,
  targetLanguage: string,
  modelName: TranslationModel = TranslationModel.GEMINI_FLASH
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const systemInstruction = `
    You are a professional subtitle engineer. 
    Convert the English SRT into a BILINGUAL .ass file.
    
    RULES:
    1. Language: Top line = ${targetLanguage}, Bottom line = English.
    2. Separator: Use '\\N' between lines.
    3. Font: You MUST use 'NotoSansSC-Regular' as the primary font name in Styles.
    4. Output: ONLY raw .ass file content. No conversation.
    
    TEMPLATE:
    [Script Info]
    ScriptType: v4.00+
    PlayResX: 1920
    PlayResY: 1080

    [V4+ Styles]
    Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
    Style: Default,NotoSansSC-Regular,22,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,1,2,10,10,20,1

    [Events]
    Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts: [{ text: `Translate this SRT to bilingual ASS in ${targetLanguage}:\n\n${srtContent}` }] }],
      config: {
        systemInstruction,
        temperature: 0.1,
      },
    });

    const result = response.text || "";
    if (!result.includes('[Events]')) {
      throw new Error("Invalid ASS structure received from AI.");
    }

    return cleanAssOutput(result);
  } catch (error: any) {
    console.error("Translation Error Details:", error);
    throw new Error(`Gemini Error: ${error.message || 'Unknown RPC error'}`);
  }
};
