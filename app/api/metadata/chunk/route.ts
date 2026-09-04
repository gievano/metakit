import { NextRequest, NextResponse } from "next/server";

// In-memory chunk storage (ephemeral, auto-cleanup after 60s)
const chunkStore = new Map<string, { chunks: Buffer[]; timestamp: number }>();

// Cleanup job: delete sessions older than 60s every 10s
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, data] of chunkStore.entries()) {
    if (now - data.timestamp > 60_000) {
      chunkStore.delete(sessionId);
    }
  }
}, 10_000);

export async function POST(req: NextRequest) {
  try {
    const { sessionId, chunkIndex, totalChunks, data } = await req.json();
    
    if (!sessionId || chunkIndex == null || !totalChunks || !data) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    
    // Init session if first chunk
    if (!chunkStore.has(sessionId)) {
      chunkStore.set(sessionId, {
        chunks: new Array(totalChunks).fill(undefined),
        timestamp: Date.now(),
      });
    }
    
    const session = chunkStore.get(sessionId)!;
    session.chunks[chunkIndex] = Buffer.from(data, "base64");
    session.timestamp = Date.now(); // refresh TTL
    
    // Check if all chunks received
    const complete = session.chunks.every(c => c !== undefined);
    
    if (complete) {
      // Concatenate into single buffer for finalize step
      const fullBuffer = Buffer.concat(session.chunks);
      session.chunks = [fullBuffer]; // replace array with single buffer
      return NextResponse.json({ complete: true });
    }
    
    return NextResponse.json({
      complete: false,
      received: session.chunks.filter(c => c !== undefined).length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Chunk upload failed" },
      { status: 500 }
    );
  }
}

export { chunkStore };
