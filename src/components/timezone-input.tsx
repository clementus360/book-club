"use client";

import { useSyncExternalStore } from "react";

/** Records the browser's timezone without asking. */
export function BrowserTimezone() {
  const zone = useSyncExternalStore(() => () => {}, () => Intl.DateTimeFormat().resolvedOptions().timeZone, () => "UTC");
  return <input type="hidden" name="timezone" value={zone} readOnly />;
}
