import { NextResponse } from 'next/server';

// In-memory progress store (shared across requests in same process)
const progressStore = new Map<string, { current: number; total: number; message: string; done: boolean }>();

export function setProgress(jobId: string, current: number, total: number, message: string, done = false) {
  progressStore.set(jobId, { current, total, message, done });
}

export function getProgress(jobId: string) {
  return progressStore.get(jobId) || null;
}

export function clearProgress(jobId: string) {
  progressStore.delete(jobId);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');
  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
  }
  const progress = getProgress(jobId);
  if (!progress) {
    return NextResponse.json({ current: 0, total: 1, message: 'Waiting...', done: false });
  }
  return NextResponse.json(progress);
}
