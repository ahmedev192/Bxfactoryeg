import { useId, useRef, useState } from 'react';
import { btnSecondaryCls, chipCls, inputCls } from './styles';

export interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  disabled?: boolean;
}

export function TagInput({ value, onChange, suggestions, placeholder, disabled }: TagInputProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');

  const trimmed = draft.trim();
  const filteredSuggestions =
    suggestions?.filter(
      (s) => s.toLowerCase().includes(trimmed.toLowerCase()) && !value.includes(s) && s !== trimmed
    ) ?? [];

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag || value.includes(tag)) return;
    onChange([...value, tag]);
    setDraft('');
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(draft);
    }
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <span key={tag} className={chipCls}>
              {tag}
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeTag(tag)}
                className="text-zinc-500 hover:text-red-400 leading-none disabled:opacity-50"
                aria-label={`إزالة ${tag}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <input
            ref={inputRef}
            type="text"
            list={filteredSuggestions.length > 0 ? listId : undefined}
            className={`${inputCls} w-full mt-0`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
          />
          {filteredSuggestions.length > 0 && (
            <datalist id={listId}>
              {filteredSuggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
        </div>
        <button
          type="button"
          disabled={disabled || !trimmed}
          onClick={() => addTag(draft)}
          className={btnSecondaryCls}
        >
          + إضافة
        </button>
      </div>
    </div>
  );
}
