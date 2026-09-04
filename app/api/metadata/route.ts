import { NextRequest, NextResponse } from "next/server";
import piexif from "piexifjs";
import { FIELDS } from "@/lib/fields";
import { chunkStore } from "./chunk/route";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ActionBody {
  action: "write" | "strip" | "finalize";
  files?: {
    name: string;
    type: string;
    data: string;
  }[];
  edits?: Record<string, string | number | null>;
  sessionId?: string;
  fileName?: string;
  isStrip?: boolean;
}

// Helper: convert decimal degrees to DMS (degrees, minutes, seconds)
function toDMS(decimal: number): [[number, number], [number, number], [number, number]] {
  const abs = Math.abs(decimal);
  const degrees = Math.floor(abs);
  const minutesFloat = (abs - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Math.round((minutesFloat - minutes) * 60 * 100); // *100 for precision
  return [
    [degrees, 1],
    [minutes, 1],
    [seconds, 100],
  ];
}

// Helper: convert fraction string "1/200" to piexif fraction [1, 200]
function toFraction(value: number): [number, number] {
  // Simple fraction: multiply by 1000 to preserve decimals
  const numerator = Math.round(value * 1000);
  return [numerator, 1000];
}

function applyEdits(dataURL: string, edits: Record<string, string | number | null>): string {
  let exifObj: any;
  
  try {
    exifObj = piexif.load(dataURL);
  } catch {
    // No existing EXIF, create empty structure
    exifObj = {
      "0th": {},
      "Exif": {},
      "GPS": {},
      "Interop": {},
      "1st": {},
      thumbnail: null,
    };
  }

  for (const f of FIELDS) {
    if (!(f.key in edits)) continue;
    const v = edits[f.key];

    if (v === null || v === "") {
      // Clear field (set to empty)
      continue;
    }

    // Map field key to piexif tag
    switch (f.key) {
      case "title":
      case "description":
        if (typeof v === "string") exifObj["0th"][piexif.ImageIFD.ImageDescription] = v;
        break;
      case "creator":
        if (typeof v === "string") exifObj["0th"][piexif.ImageIFD.Artist] = v;
        break;
      case "copyright":
        if (typeof v === "string") exifObj["0th"][piexif.ImageIFD.Copyright] = v;
        break;
      case "keywords":
        if (typeof v === "string") {
          // Store as semicolon-separated string (EXIF standard)
          const cleaned = v.split(",").map((s) => s.trim()).filter(Boolean).join(";");
          if (cleaned) exifObj["0th"][piexif.ImageIFD.XPKeywords] = cleaned;
        }
        break;
      case "usercomment":
        if (typeof v === "string") exifObj["Exif"][piexif.ExifIFD.UserComment] = v;
        break;
      case "datetimeoriginal":
        if (typeof v === "string") {
          const trimmed = v.trim();
          if (trimmed.length < 10) break;
          let formatted = trimmed.replace("T", " ");
          formatted = formatted.replace(/^(\d{4})-(\d{2})-(\d{2})/, "$1:$2:$3");
          if (formatted.match(/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}$/)) {
            formatted += ":00";
          }
          if (formatted.match(/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/)) {
            exifObj["Exif"][piexif.ExifIFD.DateTimeOriginal] = formatted;
          }
        }
        break;
      case "make":
        if (typeof v === "string") exifObj["0th"][piexif.ImageIFD.Make] = v;
        break;
      case "model":
        if (typeof v === "string") exifObj["0th"][piexif.ImageIFD.Model] = v;
        break;
      case "lensmodel":
        if (typeof v === "string") exifObj["Exif"][piexif.ExifIFD.LensModel] = v;
        break;
      case "iso":
        if (typeof v === "number") exifObj["Exif"][piexif.ExifIFD.ISOSpeedRatings] = v;
        break;
      case "fnumber":
        if (typeof v === "number") exifObj["Exif"][piexif.ExifIFD.FNumber] = toFraction(v);
        break;
      case "exposuretime":
        if (typeof v === "number") exifObj["Exif"][piexif.ExifIFD.ExposureTime] = toFraction(v);
        break;
      case "focallength":
        if (typeof v === "number") exifObj["Exif"][piexif.ExifIFD.FocalLength] = toFraction(v);
        break;
      case "whitebalance":
        if (typeof v === "string") exifObj["Exif"][piexif.ExifIFD.WhiteBalance] = v;
        break;
      case "flash":
        if (typeof v === "string") exifObj["Exif"][piexif.ExifIFD.Flash] = v;
        break;
    }
  }

  // GPS handling
  if ("gpslat" in edits && typeof edits.gpslat === "number") {
    const lat = edits.gpslat;
    exifObj["GPS"][piexif.GPSIFD.GPSLatitude] = toDMS(lat);
    exifObj["GPS"][piexif.GPSIFD.GPSLatitudeRef] = lat >= 0 ? "N" : "S";
  }
  if ("gpslon" in edits && typeof edits.gpslon === "number") {
    const lon = edits.gpslon;
    exifObj["GPS"][piexif.GPSIFD.GPSLongitude] = toDMS(lon);
    exifObj["GPS"][piexif.GPSIFD.GPSLongitudeRef] = lon >= 0 ? "E" : "W";
  }

  // Dump back to binary
  const exifBytes = piexif.dump(exifObj);
  return piexif.insert(exifBytes, dataURL);
}

function stripMetadata(dataURL: string, isJPEG: boolean): string {
  if (!isJPEG) {
    // Non-JPEG: piexif can't handle, return as-is for now
    // TODO: implement binary metadata stripping for PNG/HEIC/TIFF
    return dataURL;
  }
  // JPEG: remove all EXIF data via piexif
  return piexif.remove(dataURL);
}

export async function POST(req: NextRequest) {
  let body: ActionBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action } = body;

  // Finalize chunked upload
  if (action === "finalize") {
    const { sessionId, fileName, isStrip, edits } = body;

    if (!sessionId || !fileName) {
      return NextResponse.json(
        { error: "Missing sessionId or fileName" },
        { status: 400 }
      );
    }

    const session = chunkStore.get(sessionId);
    if (!session || !session.chunks[0]) {
      return NextResponse.json(
        { error: "Session not found or incomplete" },
        { status: 400 }
      );
    }

    const fullBuffer = session.chunks[0];
    
    try {
      const isJPEG = fileName.match(/\.(jpg|jpeg)$/i);
      
      // Strip works for all formats, edit only for JPEG
      if (!isStrip && !isJPEG) {
        return NextResponse.json({
          results: [{
            id: sessionId,
            fileName,
            ok: false,
            error: "Only JPEG files supported for editing",
          }],
        });
      }

      // Convert buffer to base64 dataURL
      const base64 = fullBuffer.toString("base64");
      const dataURL = `data:image/jpeg;base64,${base64}`;

      let resultDataURL: string;
      if (isStrip) {
        resultDataURL = stripMetadata(dataURL, !!isJPEG);
      } else {
        if (!edits || Object.keys(edits).length === 0) {
          return NextResponse.json({
            results: [{
              id: sessionId,
              fileName,
              ok: false,
              error: "No edits provided",
            }],
          });
        }
        resultDataURL = applyEdits(dataURL, edits);
      }

      // Convert dataURL back to buffer
      const resultBase64 = resultDataURL.replace(/^data:image\/jpeg;base64,/, "");
      
      chunkStore.delete(sessionId);

      return NextResponse.json({
        results: [{
          id: sessionId,
          fileName,
          ok: true,
          data: resultBase64,
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
    }
  }

  // Regular write/strip (small files)
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
    
    try {
      const isJPEG = f.name.match(/\.(jpg|jpeg)$/i);
      
      // Strip works for all formats, edit only for JPEG
      if (action === "write" && !isJPEG) {
        results.push({
          id,
          fileName: f.name,
          ok: false,
          error: "Only JPEG files supported for editing",
        });
        continue;
      }

      const dataURL = `data:image/jpeg;base64,${f.data}`;

      let resultDataURL: string;
      if (action === "strip") {
        resultDataURL = stripMetadata(dataURL, !!isJPEG);
      } else {
        const edits = body.edits ?? {};
        if (Object.keys(edits).length === 0) {
          results.push({ id, fileName: f.name, ok: false, error: "No edits provided" });
          continue;
        }
        resultDataURL = applyEdits(dataURL, edits);
      }

      const resultBase64 = resultDataURL.replace(/^data:image\/jpeg;base64,/, "");
      results.push({ id, fileName: f.name, ok: true, data: resultBase64 });
    } catch (err: any) {
      results.push({
        id,
        fileName: f.name,
        ok: false,
        error: err.message || "Processing error",
      });
    }
  }

  return NextResponse.json({ results });
}
