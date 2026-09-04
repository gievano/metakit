import { NextRequest, NextResponse } from "next/server";
import { ExifTool } from "exiftool-vendored";
import { FIELDS } from "@/lib/fields";
import { chunkStore } from "./chunk/route";

export const runtime = "nodejs";
export const maxDuration = 60;

// ponytail: single shared ExifTool instance — batches are sequential, fine for this scale
const exiftool = new ExifTool({ taskRetries: 1 });

interface ActionEdit {
  id: string;
  fileName: string;
  edits: Record<string, string | number | null>;
}

interface ActionBody {
  action: "write" | "strip" | "finalize";
  files?: {
    name: string;
    type: string;
    /** base64 of the file content */
    data: string;
  }[];
  edits?: Record<string, string | number | null>; // batch edits for "write"
  // finalize action fields
  sessionId?: string;
  fileName?: string;
  isStrip?: boolean;
}

function tmpPath(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `/tmp/${globalThis.crypto.randomUUID()}-${safe}`;
}

function toWriteTags(edits: Record<string, string | number | null>): Record<string, string | number | string[] | null> {
  const tags: Record<string, string | number | string[] | null> = {};
  for (const f of FIELDS) {
    if (!(f.key in edits)) continue;
    const v = edits[f.key];
    if (v === null || v === "") {
      tags[f.tag] = null;
    } else if (f.key === "keywords" && typeof v === "string") {
      const cleaned = v.split(",").map((s) => s.trim()).filter(Boolean);
      if (cleaned.length > 0) tags[f.tag] = cleaned;
    } else if (f.key === "datetimeoriginal" && typeof v === "string") {
      // Skip if empty or invalid format (need at least YYYY-MM-DD = 10 chars)
      const trimmed = v.trim();
      if (trimmed.length < 10) continue;
      
      // datetime-local format: "2024-01-15T10:30" (16 chars) or "2024-01-15T10:30:00" (19 chars)
      // Convert to ExifTool format: "2024:01:15 10:30:00"
      let formatted = trimmed.replace("T", " ");
      
      // Replace first 2 hyphens in date part (YYYY-MM-DD) with colons
      formatted = formatted.replace(/^(\d{4})-(\d{2})-(\d{2})/, "$1:$2:$3");
      
      // Ensure seconds present
      if (formatted.match(/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}$/)) {
        formatted += ":00"; // Add seconds if missing (16-char input)
      }
      
      // Validate final format (YYYY:MM:DD HH:MM:SS)
      if (!formatted.match(/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/)) {
        console.warn(`[toWriteTags] Invalid datetime format skipped: "${v}" → "${formatted}"`);
        continue;
      }
      
      tags[f.tag] = formatted;
    } else if (typeof v === "string" && v.trim() === "") {
      // Skip empty strings for other fields
      continue;
    } else {
      tags[f.tag] = v;
    }
  }
  if ("gpslat" in edits && typeof edits.gpslat === "number") {
    tags.GPSLatitude = Math.abs(edits.gpslat);
    tags.GPSLatitudeRef = edits.gpslat >= 0 ? "N" : "S";
    if ("gpslon" in edits && typeof edits.gpslon === "number") {
      tags.GPSLongitude = Math.abs(edits.gpslon);
      tags.GPSLongitudeRef = edits.gpslon >= 0 ? "E" : "W";
    }
  }
  return tags;
}

export async function POST(req: NextRequest) {
  let body: ActionBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action } = body;
  
  // NEW: Finalize chunked upload
  if (action === "finalize") {
    const { sessionId, fileName, isStrip, edits } = body;
    
    if (!sessionId || !fileName) {
      return NextResponse.json(
        { error: "Missing sessionId or fileName" },
        { status: 400 }
      );
    }
    
    // Retrieve session
    const session = chunkStore.get(sessionId);
    if (!session || !session.chunks[0]) {
      return NextResponse.json(
        { error: "Session not found or incomplete" },
        { status: 400 }
      );
    }
    
    const fullBuffer = session.chunks[0];
    const tmp = tmpPath(fileName);
    
    try {
      // Write full file to /tmp
      await import("fs/promises").then(fs => fs.writeFile(tmp, fullBuffer));
      
      // Process with ExifTool
      if (isStrip) {
        await exiftool.deleteAllTags(tmp);
      } else {
        const tags = toWriteTags(edits ?? {});
        if (Object.keys(tags).length === 0) {
          return NextResponse.json(
            { results: [{ id: sessionId, fileName, ok: false, error: "No edits provided" }] },
            { status: 400 }
          );
        }
        console.log("[finalize] Writing tags:", JSON.stringify(tags, null, 2));
        try {
          await exiftool.write(tmp, tags, { writeArgs: ["-overwrite_original"] });
        } catch (exiftoolErr: any) {
          console.error("[finalize] ExifTool error:", exiftoolErr.message);
          throw new Error(`ExifTool: ${exiftoolErr.message}`);
        }
      }
      
      // Read result
      const out = await import("fs/promises").then(fs => fs.readFile(tmp));
      
      // Cleanup session
      chunkStore.delete(sessionId);
      
      return NextResponse.json({
        results: [{
          id: sessionId,
          fileName,
          ok: true,
          data: out.toString("base64"),
        }],
      });
    } catch (err: any) {
      chunkStore.delete(sessionId);
      return NextResponse.json({
        results: [{
          id: sessionId,
          fileName,
          ok: false,
          error: err.message || "Processing failed",
        }],
      });
    } finally {
      await import("fs/promises")
        .then(fs => fs.rm(tmp, { force: true }))
        .catch(() => {});
    }
  }

  // EXISTING: Single/batch write/strip logic
  const { files } = body;
  if (action !== "write" && action !== "strip") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  if (!Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const results: { id: string; fileName: string; ok: boolean; data?: string; error?: string }[] = [];

  for (const f of files) {
    const id = `${f.name}-${f.data.length}`;
    const tmp = tmpPath(f.name);
    let buf: Buffer;
    try {
      buf = Buffer.from(f.data, "base64");
    } catch {
      results.push({ id, fileName: f.name, ok: false, error: "Invalid base64" });
      continue;
    }
    try {
      await import("fs/promises").then((fs) => fs.writeFile(tmp, buf));
      if (action === "strip") {
        await exiftool.deleteAllTags(tmp);
      } else {
        const tags = toWriteTags(body.edits ?? {});
        if (Object.keys(tags).length === 0) {
          results.push({ id, fileName: f.name, ok: false, error: "No edits provided" });
          continue;
        }
        await exiftool.write(tmp, tags, { writeArgs: ["-overwrite_original"] });
      }
      const out = await import("fs/promises").then((fs) => fs.readFile(tmp));
      results.push({ id, fileName: f.name, ok: true, data: out.toString("base64") });
    } catch (err) {
      results.push({
        id,
        fileName: f.name,
        ok: false,
        error: err instanceof Error ? err.message : "ExifTool error",
      });
    } finally {
      await import("fs/promises")
        .then((fs) => fs.rm(tmp, { force: true }))
        .catch(() => {});
    }
  }

  return NextResponse.json({ results });
}
