"use client";

import { FIELDS, type EditValues } from "@/lib/fields";

export default function EditorForm({
  values,
  onChange,
  disabled,
}: {
  values: EditValues;
  onChange: (key: string, value: string | number | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {FIELDS.map((f) => {
        const v = values[f.key];
        const display = v === null || v === undefined ? "" : String(v);
        const isCleared = v === null;
        const base =
          "bg-panel border rounded-sm px-2 py-1.5 text-xs w-full disabled:opacity-50 " +
          (isCleared ? "border-red-900 text-dim line-through" : "border-border");
        return (
          <div key={f.key} className={f.type === "textarea" ? "md:col-span-2" : ""}>
            <label className="flex items-center justify-between text-[10px] uppercase tracking-widest text-dim mb-1">
              <span>{f.label}</span>
              <div className="flex items-center gap-1">
                {isCleared && <span className="text-red-500 normal-case tracking-normal">cleared</span>}
                {f.type === "date" && display && (
                  <button
                    type="button"
                    onClick={() => onChange(f.key, null)}
                    className="text-dim hover:text-fg"
                    title="Clear"
                  >
                    ×
                  </button>
                )}
              </div>
            </label>
            {f.type === "textarea" ? (
              <textarea
                rows={2}
                className={base}
                disabled={disabled}
                value={display}
                placeholder={f.hint}
                onChange={(e) => onChange(f.key, e.target.value === "" ? null : e.target.value)}
              />
            ) : f.type === "keywords" ? (
              <input
                type="text"
                className={base}
                disabled={disabled}
                value={display}
                placeholder="comma, separated, keywords"
                onChange={(e) => onChange(f.key, e.target.value === "" ? null : e.target.value)}
              />
            ) : f.type === "date" ? (
              <input
                type="datetime-local"
                className={base}
                disabled={disabled}
                value={display}
                onChange={(e) => onChange(f.key, e.target.value === "" ? null : e.target.value)}
              />
            ) : f.type === "rating" ? (
              <input
                type="number"
                min={0}
                max={5}
                className={base}
                disabled={disabled}
                value={display}
                onChange={(e) =>
                  onChange(f.key, e.target.value === "" ? null : Math.max(0, Math.min(5, Number(e.target.value))))
                }
              />
            ) : f.type === "gps" ? (
              <input
                type="number"
                step="any"
                className={base}
                disabled={disabled}
                value={display}
                placeholder="decimal degrees, e.g. -6.2088"
                onChange={(e) =>
                  onChange(f.key, e.target.value === "" ? null : Number(e.target.value))
                }
              />
            ) : (
              <input
                type="text"
                className={base}
                disabled={disabled}
                value={display}
                onChange={(e) => onChange(f.key, e.target.value === "" ? null : e.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
