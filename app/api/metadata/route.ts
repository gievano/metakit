import { NextRequest, NextResponse } from "next/server";
import { ExifTool } from "exiftool-vendored";
import { FIELDS } from "@/lib/fields";

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
  action: "write" | "strip";
  files: {
    name: string;
    type: string;
    /** base64 of the file content */
    data: string;
  }[];
  edits?: Record<string, string | number | null>; // batch edits for "write"
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
      tags[f.tag] = v.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (f.key === "datetimeoriginal" && typeof v === "string") {
      tags[f.tag] = v.replace("T", " ").replace(/-/g, ":") + (v.length === 16 ? ":00" : "");
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

  const { action, files } = body;
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
