
export enum InputType {
  FILE = 'FILE',
  TEXT = 'TEXT',
  URL = 'URL'
}

export type Difficulty = 'easy' | 'medium' | 'hard';
export type QuizMode = 'interactive' | 'study';
export type Language = 'ar' | 'en' | 'es' | 'fr';

export interface QuizOption {
  id: string;
  text: string;
}

export interface Question {
  id: number;
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface QuizResponse {
  id?: string;
  title: string;
  description: string;
  questions: Question[];
  gapAnalysis: string;
  nextLevelPreview: string;
  created_at?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface AppState {
  inputType: InputType;
  difficulty: Difficulty;
  quizMode: QuizMode;
  language: Language;
  questionCount: number;
  content: string;
  file: File | null;
  isLoading: boolean;
  quiz: QuizResponse | null;
  savedQuizzes: QuizResponse[];
  error: string | null;
  userAnswers: Record<number, number>;
  showResults: boolean;
  // Auth state
  isLoggedIn: boolean;
  user: User | null;
  authMode: 'login' | 'signup';
}
