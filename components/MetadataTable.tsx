"use client";

import { useMemo, useState } from "react";
import type { MetadataRow } from "@/lib/fields";

export default function MetadataTable({ rows }: { rows: MetadataRow[] }) {
  const [filter, setFilter] = useState("");
  const [group, setGroup] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, MetadataRow[]>();
    for (const r of rows) {
      if (!map.has(r.group)) map.set(r.group, []);
      map.get(r.group)!.push(r);
    }
    return [...map.entries()];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    return groups
      .filter(([g]) => group === null || g === group)
      .map(([g, rs]) => [g, rs.filter((r) => !q || r.name.toLowerCase().includes(q) || r.value.toLowerCase().includes(q))] as const)
      .filter(([, rs]) => rs.length > 0);
  }, [groups, filter, group]);

  if (rows.length === 0)
    return <div className="p-6 text-xs text-dim">No metadata found.</div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter tags…"
          className="bg-panel border border-border rounded-sm px-2 py-1 text-xs w-48"
        />
        <button
          onClick={() => setGroup(null)}
          className={`px-2 py-1 text-xs rounded-sm border ${
            group === null ? "border-fg text-fg" : "border-border text-dim hover:text-fg"
          }`}
        >
          All
        </button>
        {groups.map(([g]) => (
          <button
            key={g}
            onClick={() => setGroup(g)}
            className={`px-2 py-1 text-xs rounded-sm border ${
              group === g ? "border-fg text-fg" : "border-border text-dim hover:text-fg"
            }`}
          >
            {g}
          </button>
        ))}
      </div>
      {filtered.map(([g, rs]) => (
        <div key={g}>
          <div className="text-[10px] uppercase tracking-widest text-dim mb-1">{g}</div>
          <table className="w-full text-xs">
            <tbody>
              {rs.map((r, i) => (
                <tr key={`${r.name}-${i}`} className="border-b border-border/50">
                  <td className="py-1.5 pr-4 text-dim align-top whitespace-nowrap w-1/3">{r.name}</td>
                  <td className="py-1.5 break-all">{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
