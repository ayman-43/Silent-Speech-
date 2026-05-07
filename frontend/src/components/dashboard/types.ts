export interface HistoryEntry {
  id: string;
  timestamp: number;
  input: 'webcam' | 'upload';
  raw: string;
  corrected: string;
  candidates: Array<{ text: string; score: number }>;
}

export interface ResultData {
  raw: string;
  corrected: string;
  candidates: Array<{ text: string; score: number }>;
  input: 'webcam' | 'upload';
}
