import type { Metadata } from "next";
import { Legal } from "@/components/legal";

export const metadata: Metadata = { title: "Terms" };

export default function Terms() {
  return (
    <Legal title="Terms of service" updated="22 November 2026">
      <p>By using Commonplace you agree to these terms.</p>
      <h2>Your account</h2>
      <p>Give a working email address, keep your password to yourself, and use one account per person. You are responsible for what happens under your account.</p>
      <h2>Clubs</h2>
      <p>Clubs are private and run by their members. Administrators may invite and remove people and manage the club’s settings, books and meetings. Please only invite people who would like to be invited.</p>
      <h2>What you write</h2>
      <p>What you write is yours. You allow Commonplace to store it and to show it to the people described on the privacy page. Keep quotations to what fair use allows, and do not post anything unlawful, harassing or that is not yours to share.</p>
      <h2>Book information</h2>
      <p>Book details and covers come from Open Library, Google Books and fellow readers, and may be incomplete or wrong.</p>
      <h2>Fair use of the service</h2>
      <p>Do not try to reach other people’s private information, disrupt the service, or collect data from it automatically.</p>
      <h2>No guarantees</h2>
      <p>Commonplace is provided as it is. We try to keep it running and your records safe, but cannot promise it will always be available. To the extent the law allows, we are not liable for losses arising from its use.</p>
      <h2>Ending things</h2>
      <p>You can leave a club, or stop using Commonplace, whenever you like. Accounts that break these terms may be closed.</p>
    </Legal>
  );
}
