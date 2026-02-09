export type TaskStatus =
  | "queued"
  | "downloading"
  | "transcoding"
  | "uploading"
  | "done"
  | "failed";

export interface CreateTaskInput {
  sourceUrl: string;
  startTime?: number;
  endTime?: number;
  format?: "mp4" | "mp3" | "m4a" | "webm";
  quality?: string;
}

export interface TaskRecord {
  id: string;
  status: TaskStatus;
  progress: number;
  sourceUrl: string;
  outputKey?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}
