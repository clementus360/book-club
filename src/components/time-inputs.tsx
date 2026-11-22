"use client";

import { useState } from "react";
import { Field } from "./forms/fields";
import { Labelled } from "./icon";

const MAX = 8;

/** Two times to begin with, and more if wanted. */
export function TimeInputs() {
  const [count, setCount] = useState(3);
  return (
    <fieldset className="mb-5">
      <legend className="label">Times that might work</legend>
      {Array.from({ length: count }, (_, i) => (
        <Field key={i} className="mb-3" label={`Time ${i + 1}${i > 1 ? " (optional)" : ""}`} name={`time_${i + 1}`} type="datetime-local" required={i < 2} />
      ))}
      {count < MAX && <button type="button" className="btn-text" onClick={() => setCount(count + 1)}><Labelled>Add another time</Labelled></button>}
    </fieldset>
  );
}
