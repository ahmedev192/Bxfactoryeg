import { useRef, useState } from 'react';
import { labelCls } from './styles';

export interface FileUploadZoneProps {
  accept?: string;
  onFile: (file: File) => void;
  disabled?: boolean;
  label?: string;
  loading?: boolean;
  hint?: string;
}

export function FileUploadZone({
  accept,
  onFile,
  disabled,
  label,
  loading,
  hint = 'اسحب الملف هنا أو انقر للاختيار',
}: FileUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const inactive = disabled || loading;

  function pickFile(file: File | null | undefined) {
    if (!file || inactive) return;
    onFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files[0]);
  }

  return (
    <div className="space-y-1">
      {label && <p className={labelCls}>{label}</p>}
      <div
        role="button"
        tabIndex={inactive ? -1 : 0}
        onClick={() => !inactive && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !inactive) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!inactive) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={[
          'rounded-xl border border-dashed px-4 py-8 text-center text-sm transition-colors',
          inactive ? 'opacity-50 cursor-not-allowed border-zinc-800 bg-zinc-950' : 'cursor-pointer',
          dragOver ? 'border-zinc-400 bg-zinc-800/50' : 'border-zinc-700 bg-zinc-950 hover:border-zinc-600 hover:bg-zinc-900/50',
        ].join(' ')}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          disabled={inactive}
          onChange={(e) => {
            pickFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {loading ? (
          <p className="text-zinc-400">جاري الرفع...</p>
        ) : (
          <>
            <p className="text-zinc-300">{hint}</p>
            {accept && <p className="mt-1 text-[10px] text-zinc-500">{accept}</p>}
          </>
        )}
      </div>
    </div>
  );
}
