"use client";

import { useCallback, useRef, useState } from "react";
import JSZip from "jszip";
import Dropzone from "@/components/Dropzone";
import FileList from "@/components/FileList";
import MetadataTable from "@/components/MetadataTable";
import EditorForm from "@/components/EditorForm";
import { parseFile } from "@/lib/exif";
import type { EditValues, ParsedFile } from "@/lib/fields";

type Tab = "viewer" | "editor";

const btn =
  "px-3 py-1.5 text-xs rounded-sm border transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

export default function Home() {
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("viewer");
  const [batchMode, setBatchMode] = useState(false);
  const [batchEdits, setBatchEdits] = useState<EditValues>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const active = files.find((f) => f.id === activeId) ?? null;

  const addFiles = useCallback(async (incoming: File[]) => {
    const parsed = await Promise.all(incoming.map(parseFile));
    for (const p of parsed) {
      const raw = incoming.find((f) => f.name === p.name);
      if (raw) {
        rawFilesRef.current.set(p.id, raw);
        originalFilesRef.current.set(p.id, raw);
      }
    }
    setFiles((prev) => [...prev, ...parsed]);
    setActiveId((prev) => prev ?? parsed[0]?.id ?? null);
  }, []);

  const patchFile = (id: string, patch: Partial<ParsedFile>) =>
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const setEdit = (id: string, key: string, value: string | number | null) =>
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, edits: { ...f.edits, [key]: value } } : f))
    );

  const rawFilesRef = useRef(new Map<string, File>());
  const originalFilesRef = useRef(new Map<string, File>());

  const toApiFiles = (list: ParsedFile[], cache: Map<string, File>) =>
    list.map(async (f) => {
      const raw = cache.get(f.id);
      if (!raw) throw new Error(`Missing raw file for ${f.name}`);
      const buf = await raw.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      return { name: f.name, type: f.type, data: btoa(bin) };
    });

  const runAction = async (action: "write" | "strip") => {
    if (!rawFilesRef.current.size) return;
    const targets = batchMode
      ? files.filter((f) => selected.has(f.id))
      : active
        ? [active]
        : [];
    if (targets.length === 0) {
      setNotice("No files selected.");
      return;
    }

    // Pre-validation: estimate total size
    let totalSize = 0;
    for (const t of targets) {
      const raw = rawFilesRef.current.get(t.id);
      if (raw) totalSize += raw.size;
    }
    const estimatedPayload = totalSize * 1.4; // base64 overhead ~33% + JSON wrapper
    if (estimatedPayload > 4_000_000 && targets.length === 1) {
      setNotice("⚠️ File too large (>4MB). Server upload limit exceeded. Try a smaller file.");
      return;
    }

    if (action === "strip" && !confirm(`Strip ALL metadata from ${targets.length} file(s)? This cannot be undone.`))
      return;

    setBusy(true);
    setNotice(null);
    const edits = batchMode ? batchEdits : active?.edits ?? {};

    // Chunked batch: split into groups of 3 files max per request
    const CHUNK_SIZE = 3;
    const chunks: ParsedFile[][] = [];
    for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
      chunks.push(targets.slice(i, i + CHUNK_SIZE));
    }

    let completed = 0;
    try {
      for (const chunk of chunks) {
        setNotice(`Processing ${completed + 1}-${completed + chunk.length} of ${targets.length}...`);
        const payload = await Promise.all(toApiFiles(chunk, rawFilesRef.current));
        const res = await fetch("/api/metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, files: payload, edits }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Request failed");
        for (const r of json.results as { fileName: string; ok: boolean; data?: string; error?: string }[]) {
          const target = chunk.find((t) => t.name === r.fileName);
          if (!target) continue;
          if (r.ok && r.data) {
            // Backup original file sebelum replace (hanya pertama kali)
            if (!originalFilesRef.current.has(target.id)) {
              const current = rawFilesRef.current.get(target.id);
              if (current) originalFilesRef.current.set(target.id, current);
            }
            const bin = atob(r.data);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const newFile = new File([bytes], target.name, { type: target.type });
            rawFilesRef.current.set(target.id, newFile);
            const re = await parseFile(newFile);
            patchFile(target.id, {
              rows: re.rows,
              originalRows: target.originalRows ?? target.rows,
              status: action === "strip" ? "stripped" : "saved",
              error: undefined,
            });
          } else {
            patchFile(target.id, { status: "error", error: r.error });
          }
        }
        completed += chunk.length;
      }

      if (targets.length === 1 && action === "write") {
        download(targets[0]);
        setNotice(`✓ Saved and downloaded ${targets[0].name}`);
      } else if (targets.length === 1 && action === "strip") {
        download(targets[0]);
        setNotice(`✓ Stripped and downloaded ${targets[0].name}`);
      } else {
        setNotice(
          action === "strip"
            ? `✓ Stripped ${targets.length} file(s). Click "Export ZIP" in header to download all.`
            : `✓ Saved ${targets.length} file(s). Click "Export ZIP" in header to download all.`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Action failed";
      setNotice(
        msg.includes("payload") || msg.includes("body")
          ? "⚠️ Request too large. Try fewer/smaller files per batch."
          : `❌ ${msg}`
      );
    } finally {
      setBusy(false);
    }
  };

  const download = (f: ParsedFile) => {
    const raw = rawFilesRef.current.get(f.id);
    if (!raw) return;
    const url = URL.createObjectURL(raw);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadZip = async () => {
    const targets = files;
    if (targets.length === 0) return;
    const zip = new JSZip();
    for (const f of targets) {
      const raw = rawFilesRef.current.get(f.id);
      if (raw) zip.file(f.name, raw);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "metakit-export.zip";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadJson = () => {
    const data = files.map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type,
      metadata: f.rows.reduce<Record<string, Record<string, string>>>((acc, r) => {
        (acc[r.group] ??= {})[r.name] = r.value;
        return acc;
      }, {}),
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "metakit-metadata.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const removeFile = (id: string) => {
    rawFilesRef.current.delete(id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (activeId === id) setActiveId(files.find((f) => f.id !== id)?.id ?? null);
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const revertToOriginal = async (id: string) => {
    const orig = originalFilesRef.current.get(id);
    if (!orig) {
      setNotice("No original file to revert to.");
      return;
    }
    if (!confirm("Revert to original file? Current edits will be lost.")) return;
    rawFilesRef.current.set(id, orig);
    const re = await parseFile(orig);
    patchFile(id, {
      rows: re.rows,
      originalRows: undefined,
      edits: {},
      status: "ready",
      error: undefined,
    });
    setNotice(`✓ Reverted ${re.name} to original`);
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-bold tracking-tight">MetaKit</span>
          <span className="text-[10px] text-dim border border-border rounded-sm px-1.5 py-0.5">v0.1</span>
          {batchMode && selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-1 bg-accent/20 border border-accent rounded-sm">
                {selected.size} selected
              </span>
              <button
                onClick={() => setSelected(new Set())}
                className="text-[10px] px-1.5 py-0.5 border border-border hover:border-dim rounded-sm"
              >
                Clear
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={downloadJson} disabled={files.length === 0} className={`${btn} border-border hover:border-dim`}>
            Export JSON
          </button>
          <button onClick={downloadZip} disabled={files.length === 0} className={`${btn} border-border hover:border-dim`}>
            Export ZIP
          </button>
        </div>
      </header>

      {files.length === 0 ? (
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-xl flex flex-col gap-6">
            <Dropzone onFiles={(fs) => { fs.forEach((f) => rawFilesRef.current.set(`${f.name}-${f.size}-${f.lastModified}`, f)); addFiles(fs); }} />
            <p className="text-center text-[11px] text-dim leading-relaxed">
              Metadata is parsed locally in your browser. Edits are applied ephemerally by an ExifTool
              serverless function — files are processed in-memory and never stored.
            </p>
          </div>
        </main>
      ) : (
        <div className="flex-1 flex min-h-0 relative">
          {/* Mobile sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden fixed bottom-4 left-4 z-50 px-3 py-2 bg-panel2 border border-border rounded-sm text-xs shadow-lg"
          >
            {sidebarOpen ? "Close" : `Files (${files.length})`}
          </button>
          
          {/* Sidebar */}
          <aside className={`w-64 shrink-0 border-r border-border flex flex-col min-h-0 ${
            sidebarOpen ? "fixed inset-y-0 left-0 z-40 bg-bg md:relative" : "hidden md:flex"
          }`}>
            <div className="flex items-center justify-between px-3 py-2 border-b border-border text-xs text-dim shrink-0">
              <span>{files.length} file(s)</span>
              {batchMode && (
                <span className="flex items-center gap-2">
                  <button onClick={() => setSelected(new Set(files.map((f) => f.id)))} className="hover:text-fg">
                    all
                  </button>
                  <span>·</span>
                  <button onClick={() => setSelected(new Set())} className="hover:text-fg">
                    none
                  </button>
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-1">
              {files.map((f) =>
                batchMode ? (
                  <label key={f.id} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-panel rounded-sm cursor-pointer">
                    <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggleSelect(f.id)} className="accent-white" />
                    <span className="truncate">{f.name}</span>
                  </label>
                ) : (
                  <button
                    key={f.id}
                    onClick={() => setActiveId(f.id)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs rounded-sm ${
                      f.id === activeId ? "bg-panel2 text-fg" : "text-dim hover:bg-panel"
                    }`}
                  >
                    <span className="truncate">{f.name}</span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(f.id);
                      }}
                      className="text-dim hover:text-red-500 shrink-0"
                      title="Remove"
                    >
                      ×
                    </span>
                  </button>
                )
              )}
            </div>
            <div className="p-2 border-t border-border shrink-0">
              <Dropzone onFiles={(fs) => { fs.forEach((f) => rawFilesRef.current.set(`${f.name}-${f.size}-${f.lastModified}`, f)); addFiles(fs); }} compact />
            </div>
          </aside>

          {/* Main */}
          <main className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0 gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                {(["viewer", "editor"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-3 py-1 text-xs rounded-sm capitalize ${
                      tab === t ? "bg-panel2 text-fg" : "text-dim hover:text-fg"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-dim cursor-pointer select-none">
                  <input type="checkbox" checked={batchMode} onChange={(e) => { setBatchMode(e.target.checked); setSelected(new Set()); }} className="accent-white" />
                  Batch mode
                </label>
                {tab === "editor" && (
                  <>
                    <button
                      onClick={() => runAction("write")}
                      disabled={busy}
                      className={`${btn} bg-fg text-bg border-fg font-medium hover:opacity-90`}
                    >
                      {busy ? "Saving…" : batchMode ? `Apply to ${selected.size} file(s)` : "Save edits"}
                    </button>
                    <button
                      onClick={() => runAction("strip")}
                      disabled={busy}
                      className={`${btn} border-red-900 text-red-500 hover:border-red-500`}
                    >
                      Strip all
                    </button>
                    {!batchMode && active?.originalRows && (
                      <button
                        onClick={() => revertToOriginal(active.id)}
                        disabled={busy}
                        className={`${btn} border-border text-dim hover:border-dim`}
                      >
                        Revert
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {notice && (
              <div className="px-4 py-2 text-xs border-b border-border text-dim shrink-0">{notice}</div>
            )}

            <div className="flex-1 overflow-y-auto p-4">
              {tab === "viewer" ? (
                active ? (
                  <MetadataTable rows={active.rows} />
                ) : (
                  <div className="text-xs text-dim p-6">Select a file.</div>
                )
              ) : batchMode ? (
                <div className="flex flex-col gap-4">
                  <div className="text-xs text-dim">
                    Edits below will be applied to all checked files ({selected.size}). Empty fields are ignored; cleared fields are deleted.
                  </div>
                  <EditorForm values={batchEdits} onChange={(k, v) => setBatchEdits((prev) => ({ ...prev, [k]: v }))} />
                </div>
              ) : active ? (
                <div className="flex flex-col gap-4">
                  {active.error && <div className="text-xs text-red-500">{active.error}</div>}
                  <EditorForm values={active.edits} onChange={(k, v) => setEdit(active.id, k, v)} />
                </div>
              ) : (
                <div className="text-xs text-dim p-6">Select a file.</div>
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}
