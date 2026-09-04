export type FieldType = "text" | "textarea" | "keywords" | "date" | "number" | "gps" | "rating";

export interface FieldDef {
  key: string;
  label: string;
  tag: string; // ExifTool tag name (MWG-aware writes go to EXIF+IPTC+XMP via useMWG)
  type: FieldType;
  hint?: string;
}

export const FIELDS: FieldDef[] = [
  { key: "title", label: "Title", tag: "Title", type: "text" },
  { key: "description", label: "Description", tag: "ImageDescription", type: "textarea" },
  { key: "creator", label: "Creator / Artist", tag: "Creator", type: "text" },
  { key: "copyright", label: "Copyright", tag: "CopyrightNotice", type: "text" },
  { key: "keywords", label: "Keywords", tag: "Keywords", type: "keywords" },
  { key: "datetimeoriginal", label: "Date Taken", tag: "DateTimeOriginal", type: "date" },
  { key: "gpslat", label: "GPS Latitude", tag: "GPSLatitude", type: "gps" },
  { key: "gpslon", label: "GPS Longitude", tag: "GPSLongitude", type: "gps" },
  { key: "usercomment", label: "User Comment", tag: "UserComment", type: "textarea" },
  { key: "rating", label: "Rating (0-5)", tag: "Rating", type: "rating" },
  { key: "credit", label: "Credit", tag: "Credit", type: "text" },
  { key: "source", label: "Source", tag: "Source", type: "text" },
  { key: "headline", label: "Headline", tag: "Headline", type: "text" },
  { key: "instructions", label: "Instructions", tag: "Instructions", type: "textarea" },
];

export const CLEARABLE = ["gpslat", "gpslon", "rating", "usercomment", "headline", "instructions", "credit", "source"];

/** Values the client sends per file edit. null => delete tag. */
export type EditValues = Record<string, string | number | null>;

export interface MetadataRow {
  group: string;
  name: string;
  value: string;
}

export interface ParsedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  rows: MetadataRow[];
  edits: EditValues;
  status: "ready" | "saving" | "saved" | "stripped" | "error";
  error?: string;
}
