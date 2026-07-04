import { btnSecondaryCls } from './styles';

export interface WeightValues {
  time: number;
  cost: number;
  certainty: number;
}

export interface WeightSlidersProps {
  value: WeightValues;
  onChange: (value: WeightValues) => void;
  disabled?: boolean;
}

const KEYS: (keyof WeightValues)[] = ['time', 'cost', 'certainty'];

const LABELS: Record<keyof WeightValues, string> = {
  time: 'الوقت',
  cost: 'التكلفة',
  certainty: 'الثقة',
};

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function total(v: WeightValues) {
  return v.time + v.cost + v.certainty;
}

function normalize(v: WeightValues): WeightValues {
  const sum = total(v);
  if (sum === 0) return { time: 34, cost: 33, certainty: 33 };
  const scale = 100 / sum;
  const scaled = {
    time: clamp(v.time * scale),
    cost: clamp(v.cost * scale),
    certainty: clamp(v.certainty * scale),
  };
  const diff = 100 - total(scaled);
  if (diff !== 0) scaled.certainty = clamp(scaled.certainty + diff);
  return scaled;
}

function adjustWeight(current: WeightValues, key: keyof WeightValues, newVal: number): WeightValues {
  newVal = clamp(newVal);
  const others = KEYS.filter((k) => k !== key);
  const otherSum = others.reduce((s, k) => s + current[k], 0);
  const remaining = 100 - newVal;

  if (otherSum === 0) {
    const half = Math.floor(remaining / 2);
    return {
      ...current,
      [key]: newVal,
      [others[0]]: half,
      [others[1]]: remaining - half,
    } as WeightValues;
  }

  const ratio = remaining / otherSum;
  const next = { ...current, [key]: newVal };
  let allocated = newVal;
  others.forEach((k, i) => {
    if (i === others.length - 1) {
      next[k] = clamp(100 - allocated);
    } else {
      next[k] = clamp(current[k] * ratio);
      allocated += next[k];
    }
  });
  return next;
}

export function WeightSliders({ value, onChange, disabled }: WeightSlidersProps) {
  const sum = total(value);
  const valid = sum === 100;

  return (
    <div className="space-y-3 text-sm">
      {KEYS.map((key) => (
        <label key={key} className="block text-xs text-zinc-500">
          <div className="flex justify-between items-center mb-1">
            <span>{LABELS[key]}</span>
            <span className="text-zinc-300 tabular-nums">{value[key]}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            disabled={disabled}
            value={value[key]}
            onChange={(e) => onChange(adjustWeight(value, key, Number(e.target.value)))}
            className="w-full accent-zinc-100 disabled:opacity-50"
          />
        </label>
      ))}

      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={valid ? 'text-emerald-400' : 'text-amber-400'}>
          المجموع: {sum}% {!valid && '(يجب أن يساوي 100%)'}
        </span>
        {!valid && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(normalize(value))}
            className={btnSecondaryCls}
          >
            توازن
          </button>
        )}
      </div>
    </div>
  );
}
