
import { GoogleGenAI, Type } from "@google/genai";
import { QuizResponse } from "../types";

export const generateQuiz = async (
  content: string, 
  inputType: string,
  difficulty: string,
  language: string,
  count: number,
  subject: string = "الفيزياء الحديثة",
  tone: string = "academic"
): Promise<QuizResponse> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    ROLE: Elite Pedagogical AI.
    SUBJECT: ${subject}.
    CONTENT: "${content}"
    DIFFICULTY: ${difficulty}.
    TONE: ${tone}.
    LANGUAGE: Arabic (MSA).

    TASK: Generate exactly ${count} educational questions.
    REQUIREMENTS:
    - High pedagogical quality.
    - Deep reasoning, not surface recall.
    - Detailed explanations.
    - Professional academic terminology.

    OUTPUT: JSON strictly matching the schema.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: {
      temperature: 0.8,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          gapAnalysis: { type: Type.STRING },
          nextLevelPreview: { type: Type.STRING },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.INTEGER },
                question: { type: Type.STRING },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                correctAnswerIndex: { type: Type.INTEGER },
                explanation: { type: Type.STRING }
              },
              required: ["id", "question", "options", "correctAnswerIndex", "explanation"]
            }
          }
        },
        required: ["title", "description", "gapAnalysis", "nextLevelPreview", "questions"]
      }
    }
  });

  if (!response.text) throw new Error("AI Error");
  return JSON.parse(response.text.trim());
};
