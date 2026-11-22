import type { Metadata } from "next";
import { PrivateLink } from "@/components/calendar";
import { FormDialog } from "@/components/forms/dialog";
import { Fold } from "@/components/fold";
import { PageHeader, Section } from "@/components/ui";
import { turnOffCalendarLink } from "@/lib/actions/calendar";
import { hasCalendarLink } from "@/lib/data/calendar";

export const metadata: Metadata = { title: "Your calendar" };

const APPS = [["google", "Google Calendar"], ["apple", "Apple Calendar"], ["outlook", "Outlook.com"], ["work", "Outlook for work or school"]] as const;

export default async function CalendarPage() {
  const on = await hasCalendarLink();
  return (
    <>
      <PageHeader kicker="Just for you" title="Your calendar">See your meetings in the calendar you already use. You do this once. New meetings, changes and cancellations then follow by themselves, from all your clubs.</PageHeader>
      <Section title="Which calendar do you use?" note="It will ask you to confirm. Meetings you have said you can’t make are left out.">
        <div className="flex flex-wrap gap-3">
          {/* Plain links: they leave for the calendar, and must not be prefetched. */}
          {APPS.map(([app, label]) => <a key={app} className="btn btn-plain" href={`/app/calendar/open?with=${app}`} {...(app !== "apple" && { target: "_blank" })} rel="noopener noreferrer">{label}</a>)}
        </div>
        <p className="meta mt-5 max-w-prose">Your calendar decides how often to check. Google can take up to a day, so check the meeting’s own page for anything changed at the last minute.</p>
      </Section>
      <Section title="Something else">
        <Fold title="Another calendar app" note="Copy a link to paste into it."><PrivateLink on={on} /></Fold>
        {on && (
          <Fold title="Stop" note="Turn off the link your calendars use.">
            <p className="mb-5 max-w-prose text-soft">Do this if someone else has your link. You can choose a calendar again afterwards and will get a new one.</p>
            <FormDialog trigger="Turn off my calendar link" triggerClass="btn btn-danger" title="Turn off your link?" action={turnOffCalendarLink} submit="Turn it off" submitClass="btn btn-danger">
              <p>Every calendar using it stops updating. Your meetings here are not affected.</p>
            </FormDialog>
          </Fold>
        )}
      </Section>
    </>
  );
}
