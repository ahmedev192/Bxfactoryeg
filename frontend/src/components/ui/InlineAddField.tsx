import { useState } from 'react';
import { btnSecondaryCls, inputCls, labelCls } from './styles';

export interface InlineAddFieldProps {
  label: string;
  placeholder?: string;
  onAdd: (value: string) => void;
  disabled?: boolean;
}

export function InlineAddField({ label, placeholder, onAdd, disabled }: InlineAddFieldProps) {
  const [draft, setDraft] = useState('');

  function submit() {
    const value = draft.trim();
    if (!value) return;
    onAdd(value);
    setDraft('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  }

  return (
    <label className={labelCls}>
      {label}
      <div className="flex gap-2 mt-1">
        <input
          type="text"
          className={`${inputCls} flex-1 min-w-0 mt-0`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
        />
        <button type="button" disabled={disabled || !draft.trim()} onClick={submit} className={btnSecondaryCls}>
          + إضافة
        </button>
      </div>
    </label>
  );
}
