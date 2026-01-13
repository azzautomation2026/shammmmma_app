
import { GoogleGenAI, Type } from "@google/genai";
import { QuizResponse } from "../types";

export const generateQuiz = async (
  content: string, 
  inputType: 'FILE' | 'TEXT' | 'URL',
  difficulty: string,
  language: string,
  count: number
): Promise<QuizResponse> => {
  // Always use { apiKey: process.env.API_KEY } as required by the SDK guidelines.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const languageNames: Record<string, string> = {
    ar: 'Arabic',
    en: 'English',
    es: 'Spanish',
    fr: 'French'
  };

  const entropy = Date.now().toString(36);

  const prompt = `
    You are an elite pedagogical AI tutor and instructional designer. 
    Your mission is to generate a comprehensive educational assessment based on the provided content.

    PEDAGOGICAL REQUIREMENTS:
    1. ARABIC FIRST: If language is Arabic, use natural, eloquent, and educational Modern Standard Arabic (MSA). Avoid translation artifacts.
    2. BLOOM'S TAXONOMY: Do not just ask for facts. Focus on:
       - Conceptual understanding (Explain "Why").
       - Inference (What happens if...).
       - Application (How to use this...).
    3. GAP ANALYSIS: Identify the most complex concepts in this text that students usually struggle with. 
    4. SEQUENCING: Questions should feel like a learning journey.
    5. NO SUMMARIES: Questions must be testing deep knowledge, not just repeating sentences.

    Content Reference [ID: ${entropy}]:
    "${content}"
    
    The quiz MUST be entirely in ${languageNames[language]}.
    Difficulty level: ${difficulty}.
    
    The JSON output must contain:
    - title: An academic title.
    - description: Educational objectives of this quiz.
    - gapAnalysis: A 2-3 sentence analysis of the "Understanding Gaps" (points of potential confusion) in this text.
    - nextLevelPreview: A suggestion for how to deepen knowledge or a "Mastery Challenge" hint for a higher difficulty.
    - questions: Exactly ${count} deep educational multiple-choice questions.

    Each question object must include:
    - id: Unique integer.
    - question: The pedagogical challenge text.
    - options: Four plausible academic distractors.
    - correctAnswerIndex: Index (0-3).
    - explanation: A detailed breakdown of WHY the answer is correct and how it relates to the broader concept.
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

  // Extract text using the .text property as per SDK guidelines.
  if (!response.text) {
    throw new Error("AI failed to generate a response.");
  }

  try {
    return JSON.parse(response.text.trim());
  } catch (e) {
    console.error("Error parsing JSON:", e);
    throw new Error("Failed to process quiz data.");
  }
};
