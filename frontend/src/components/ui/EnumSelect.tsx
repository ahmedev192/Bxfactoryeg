import { inputCls, labelCls } from './styles';

export interface EnumOption<T extends string = string> {
  value: T;
  label: string;
}

export interface EnumSelectProps<T extends string = string> {
  label?: string;
  value: T;
  onChange: (value: T) => void;
  options: EnumOption<T>[];
  disabled?: boolean;
  placeholder?: string;
}

export function EnumSelect<T extends string = string>({
  label,
  value,
  onChange,
  options,
  disabled,
  placeholder,
}: EnumSelectProps<T>) {
  const select = (
    <select
      className={`${inputCls} w-full ${label ? 'mt-1' : ''}`}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );

  if (!label) return select;

  return (
    <label className={labelCls}>
      {label}
      {select}
    </label>
  );
}
