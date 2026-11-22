import { BookCheck, ThumbsUp, BookOpen, BookPlus, BookX, CalendarClock, CalendarPlus, CalendarX, CircleAlert, House, Library, RotateCcw, UserMinus, UserPlus, Vote, type LucideIcon } from "lucide-react";

const GLYPHS: Record<string, LucideIcon> = {
  club_created: House, member_joined: UserPlus, member_left: UserMinus, book_added: Library, recommendation_shared: ThumbsUp,
  book_nominated: BookPlus, nominations_opened: BookPlus, nominations_closed: BookPlus, nominations_reopened: RotateCcw,
  voting_opened: Vote, voting_opened_early: Vote, voting_closed_early: Vote, voting_reopened: RotateCcw, runoff_opened: Vote, decision_needed: CircleAlert,
  book_selected: BookOpen, cycle_completed: BookCheck, cycle_reopened: RotateCcw, cycle_cancelled: BookX,
  meeting_created: CalendarPlus, meeting_updated: CalendarClock, meeting_cancelled: CalendarX,
};
export const eventIcon = (type: string): LucideIcon => GLYPHS[type] ?? BookOpen;
