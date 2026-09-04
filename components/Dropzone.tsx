"use client";

import { useCallback, useRef, useState } from "react";

const ACCEPT = ".jpg,.jpeg,.png,.heic,.tif,.tiff,.webp,image/*";

export default function Dropzone({ onFiles, compact }: { onFiles: (files: File[]) => void; compact?: boolean }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) onFiles(files);
    },
    [onFiles]
  );

  if (compact) {
    return (
      <button
        onClick={() => inputRef.current?.click()}
        className="w-full px-3 py-2 text-xs border border-dashed border-border hover:border-dim rounded-sm transition-colors"
      >
        + Add more files
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) onFiles(files);
            e.target.value = "";
          }}
        />
      </button>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`flex flex-col items-center justify-center gap-3 border border-dashed rounded-md px-6 py-20 cursor-pointer transition-colors select-none ${
        over ? "border-fg bg-panel2" : "border-border hover:border-dim"
      }`}
    >
      <div className="text-2xl">⌘</div>
      <div className="text-sm">Drop images here, or click to browse</div>
      <div className="text-xs text-dim">JPG · PNG · HEIC · TIFF · WEBP — parsed locally in your browser</div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
