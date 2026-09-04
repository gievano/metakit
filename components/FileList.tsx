"use client";

import type { ParsedFile } from "@/lib/fields";
import { formatBytes } from "@/lib/exif";

const STATUS_STYLE: Record<ParsedFile["status"], string> = {
  ready: "text-dim",
  saving: "text-yellow-500",
  saved: "text-green-500",
  stripped: "text-green-500",
  error: "text-red-500",
};

export default function FileList({
  files,
  activeId,
  onSelect,
}: {
  files: ParsedFile[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-col gap-px">
      {files.map((f) => (
        <button
          key={f.id}
          onClick={() => onSelect(f.id)}
          className={`flex items-center justify-between gap-2 px-3 py-2 text-left text-xs rounded-sm transition-colors ${
            f.id === activeId ? "bg-panel2 text-fg" : "hover:bg-panel text-dim"
          }`}
        >
          <span className="truncate">{f.name}</span>
          <span className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-dim">{formatBytes(f.size)}</span>
            <span className={`text-[10px] uppercase ${STATUS_STYLE[f.status]}`}>
              {f.status === "error" ? "ERR" : f.status.slice(0, 4)}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
