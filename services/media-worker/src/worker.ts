import "dotenv/config";

import { randomUUID } from "node:crypto";

type JobPayload = {
  taskId: string;
  sourceUrl: string;
  startTime?: number;
  endTime?: number;
  format?: string;
  quality?: string;
};

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function postJSON(path: string, body: unknown) {
  const baseUrl = process.env.API_BASE_URL;
  const token = process.env.API_INTERNAL_TOKEN;
  if (!baseUrl) throw new Error("Missing API_BASE_URL");

  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path} failed: ${res.status} ${text}`);
  }
}

async function processTask(job: JobPayload) {
  const now = new Date().toISOString();
  await postJSON(`/internal/tasks/${job.taskId}/progress`, {
    status: "downloading",
    progress: 10,
    updatedAt: now,
  });

  // TODO: integrate yt-dlp download here
  await sleep(1200);

  await postJSON(`/internal/tasks/${job.taskId}/progress`, {
    status: "transcoding",
    progress: 55,
    updatedAt: new Date().toISOString(),
  });

  // TODO: integrate ffmpeg trim/transcode here
  await sleep(1200);

  await postJSON(`/internal/tasks/${job.taskId}/progress`, {
    status: "uploading",
    progress: 80,
    updatedAt: new Date().toISOString(),
  });

  // TODO: upload file to R2 here and set outputKey
  await sleep(800);
  const outputKey = `videos/${job.taskId}/${randomUUID()}.mp4`;

  await postJSON(`/internal/tasks/${job.taskId}/complete`, {
    status: "done",
    progress: 100,
    outputKey,
    updatedAt: new Date().toISOString(),
  });
}

async function mockQueuePoll(): Promise<JobPayload | null> {
  // TODO: replace with Redis/BullMQ/Cloudflare Queue consumer
  return null;
}

async function main() {
  // eslint-disable-next-line no-console
  console.log("media-worker started");

  while (true) {
    try {
      const job = await mockQueuePoll();
      if (!job) {
        await sleep(1000);
        continue;
      }

      await processTask(job);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("worker loop error", error);
      await sleep(1500);
    }
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("fatal error", error);
  process.exit(1);
});
