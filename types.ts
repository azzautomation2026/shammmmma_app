
export enum InputType {
  FILE = 'FILE',
  TEXT = 'TEXT',
  URL = 'URL'
}

export type Difficulty = 'easy' | 'medium' | 'hard';
export type QuizMode = 'interactive' | 'study';
export type Language = 'ar' | 'en';
export type QuestionType = 'mcq' | 'true_false' | 'essay';
export type ToneStyle = 'academic' | 'simple';

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
  subject?: string;
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
  subject: string;
  questionTypes: QuestionType[];
  toneStyle: ToneStyle;
  language: Language;
  questionCount: number;
  content: string;
  isLoading: boolean;
  quiz: QuizResponse | null;
  savedQuizzes: QuizResponse[];
  error: string | null;
  userAnswers: Record<number, number>;
  showResults: boolean;
  isLoggedIn: boolean;
  user: User | null;
  authMode: 'login' | 'signup';
}
