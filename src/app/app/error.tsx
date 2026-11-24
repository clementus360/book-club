"use client";

import { SomethingWrong } from "@/components/something-wrong";
import { PageHeader } from "@/components/ui";
import { BRAND } from "@/lib/brand";

export default function AppError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <><PageHeader kicker={BRAND.name} title="Something went wrong" /><SomethingWrong {...props} /></>;
}
