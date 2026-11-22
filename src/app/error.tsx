"use client";

import { Shell } from "@/components/shell";
import { SomethingWrong } from "@/components/something-wrong";

export default function ErrorPage(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <Shell title="Something went wrong"><SomethingWrong {...props} /></Shell>;
}
