import Link from "next/link";
import { Shell } from "@/components/shell";

export default function NotFound() {
  return (
    <Shell title="This page is missing" lede="It may have moved, or it may belong to a club you are not in.">
      <Link href="/app" className="btn btn-primary">Back to Commonplace</Link>
    </Shell>
  );
}
