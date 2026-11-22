import { useId, type ComponentProps, type ReactNode } from "react";

export function Field({ label, hint, className = "mb-5", ...props }: { label: string; hint?: ReactNode; className?: string } & ComponentProps<"input">) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="label">{label}</label>
      <input id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...props} className="input" />
      {hint && <p id={`${id}-hint`} className="hint">{hint}</p>}
    </div>
  );
}

export function TextArea({ label, hint, className = "mb-5", ...props }: { label: string; hint?: ReactNode; className?: string } & ComponentProps<"textarea">) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="label">{label}</label>
      <textarea id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...props} className="input" />
      {hint && <p id={`${id}-hint`} className="hint">{hint}</p>}
    </div>
  );
}

export function Select({ label, hint, className = "mb-5", children, ...props }: { label: string; hint?: ReactNode; className?: string } & ComponentProps<"select">) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="label">{label}</label>
      <select id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...props} className="input">{children}</select>
      {hint && <p id={`${id}-hint`} className="hint">{hint}</p>}
    </div>
  );
}

export function Checkbox({ label, hint, ...props }: { label: ReactNode; hint?: ReactNode } & ComponentProps<"input">) {
  return (
    <label className="choice">
      <input type="checkbox" {...props} />
      <span>{label}{hint && <span className="block text-sm text-soft">{hint}</span>}</span>
    </label>
  );
}

export function RatingField({ defaultValue, legend = "Rating (optional)" }: { defaultValue?: number | null; legend?: string }) {
  return (
    <fieldset className="mb-5">
      <legend className="label">{legend}</legend>
      <div className="flex flex-wrap gap-x-5">
        {[["", "None"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]].map(([value, label]) => (
          <label key={value} className="choice items-center">
            <input type="radio" name="rating" value={value} defaultChecked={String(defaultValue ?? "") === value} className="!mt-0" />
            <span>{label}{value && <span className="text-rubric" aria-hidden> ★</span>}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const zones = () => ["UTC", ...Intl.supportedValuesOf("timeZone").filter((z) => z !== "UTC")];

export function TimezoneSelect({ defaultValue, hint, label = "Timezone" }: { defaultValue: string; hint?: string; label?: string }) {
  const all = zones();
  if (!all.includes(defaultValue)) all.unshift(defaultValue);
  return (
    <Select label={label} name="timezone" defaultValue={defaultValue} hint={hint}>
      {all.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
    </Select>
  );
}
