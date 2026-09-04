import ExifReader from "exifreader";
import type { MetadataRow, ParsedFile } from "./fields";

const GROUPS: Record<string, string> = {
  exif: "EXIF",
  gps: "GPS",
  iptc: "IPTC",
  xmp: "XMP",
  file: "File",
  jfif: "File",
  photoshop: "Photoshop",
  icc: "ICC",
  mpf: "MPF",
  png: "PNG",
  tiff: "TIFF",
  "xmp Rights": "XMP",
};

export function parseFile(file: File): Promise<ParsedFile> {
  return ExifReader.load(file, { expanded: true })
    .then((tags) => {
      const rows: MetadataRow[] = [];
      for (const [group, label] of Object.entries(GROUPS)) {
        const section = (tags as Record<string, Record<string, { description?: string; value?: unknown }>>)[group];
        if (!section) continue;
        for (const [name, tag] of Object.entries(section)) {
          if (name === "Thumbnail" || name.startsWith("_")) continue;
          const value =
            typeof tag.value === "object" && tag.value !== null && "description" in tag
              ? (tag as { description?: string }).description ?? String(tag.value)
              : Array.isArray(tag.value)
                ? tag.value.join(", ")
                : String(tag.value);
          rows.push({ group: label, name, value });
        }
      }
      return {
        id: `${file.name}-${file.size}-${file.lastModified}`,
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        rows,
        edits: {},
        status: "ready" as const,
      };
    })
    .catch((err: unknown) => ({
      id: `${file.name}-${file.size}-${file.lastModified}`,
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      rows: [],
      edits: {},
      status: "error" as const,
      error: err instanceof Error ? err.message : "Failed to parse metadata",
    }));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
