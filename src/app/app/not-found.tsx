import { Labelled } from "@/components/icon";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { BRAND } from "@/lib/brand";

export default function NotFound() {
  return (
    <>
      <PageHeader kicker={BRAND.name} title="This is not here">It may have been removed, or it may belong to a club you are not in.</PageHeader>
      <Link className="btn btn-plain" href="/app"><Labelled>Back to the club</Labelled></Link>
    </>
  );
}
