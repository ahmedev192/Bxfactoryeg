import { inputCls, labelCls } from './styles';

export interface PresetPickerProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: string[];
  allowEmpty?: boolean;
  disabled?: boolean;
  emptyLabel?: string;
}

export function PresetPicker({
  label,
  value,
  onChange,
  options,
  allowEmpty = true,
  disabled,
  emptyLabel = '— بدون —',
}: PresetPickerProps) {
  return (
    <label className={labelCls}>
      {label}
      <select
        className={`${inputCls} w-full mt-1`}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === '' ? null : v);
        }}
      >
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}
