import { Labelled } from "@/components/icon";
import Link from "next/link";
import { PageHeader } from "@/components/ui";

export default function NotFound() {
  return (
    <>
      <PageHeader kicker="Commonplace" title="This is not here">It may have been removed, or it may belong to a club you are not in.</PageHeader>
      <Link className="btn btn-plain" href="/app"><Labelled>Back to the club</Labelled></Link>
    </>
  );
}
