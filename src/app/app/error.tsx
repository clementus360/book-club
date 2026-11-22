"use client";

import { SomethingWrong } from "@/components/something-wrong";
import { PageHeader } from "@/components/ui";

export default function AppError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <><PageHeader kicker="Commonplace" title="Something went wrong" /><SomethingWrong {...props} /></>;
}
