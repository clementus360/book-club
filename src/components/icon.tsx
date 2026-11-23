import {
  ArrowLeft, ArrowLeftRight, ArrowRight, BookCheck, ThumbsUp, BookOpen, BookPlus, BookX, CalendarClock, CalendarPlus, CalendarSearch, CalendarSync, CalendarX, Check, CheckCheck,
  CircleQuestionMark, Copy, ListChecks, ListOrdered, LogOut, MessageCircleQuestionMark, NotebookPen, Pencil, Plus, Quote, RotateCcw, Search,
  ShieldCheck, SlidersHorizontal, Star, Trash2, Undo2, UserMinus, UserPlus, Users, Vote, type LucideIcon,
} from "lucide-react";
import { KINDS, words, type Words } from "@/lib/kinds";

/** One weight and one size everywhere, sized by the text beside it. Always decorative: the words carry the meaning. */
export function Icon({ of: Glyph, className = "", size = "1.15em" }: { of: LucideIcon; className?: string; size?: string }) {
  return <Glyph aria-hidden focusable={false} size={size} strokeWidth={1.6} className={`inline-block shrink-0 ${className}`} />;
}

/**
 * The icon for an action, by its label, so the same action looks the same
 * wherever it appears. Saving and other form buttons deliberately have none.
 */
const actions = ({ one, a, mine, verbing }: Words): Record<string, LucideIcon> => ({
  [`Add ${a}`]: Plus, [`Add your first ${one}`]: Plus, [`Add to ${mine.toLowerCase()}`]: Plus, [`Add to ${mine}`]: Plus, "Add to the club shelf": Plus,
  "Add another volume": Plus, "Add a question": MessageCircleQuestionMark, "Add a quotation": Quote, "Add a note": NotebookPen,
  "Write a club review": Star, "Edit my club review": Pencil, "Write up this meeting": NotebookPen,
  "Edit": Pencil, "Edit meeting": Pencil, [`Edit ${one} details`]: Pencil, [`Change ${one}`]: ArrowLeftRight,
  "Remove": Trash2, [`Remove from ${mine.toLowerCase()}`]: Trash2, "Remove from club shelf": Trash2, "Close the club": Trash2, "Withdraw": Undo2, "Revoke": Undo2,
  "Invite someone": UserPlus, "Invite friends": UserPlus, "Members": Users, "Leave club": LogOut, "Sign out": LogOut,
  "Make an administrator": ShieldCheck, "Make an ordinary member": UserMinus,
  [`Nominate ${a}`]: BookPlus, [`Nominate this ${one}`]: BookPlus, "Recommend to club": ThumbsUp, "Recommend": ThumbsUp,
  [`Start choosing ${a}`]: BookPlus, "Start the vote now": Vote, "Vote now": Vote, "Send my vote": Vote, "Update my vote": Vote, "See my vote": ListOrdered,
  "Count the votes now": ListChecks, "Record the decision": ListChecks, "See the nominations": ListOrdered, "See how it was chosen": ListOrdered, "See the result so far": ListOrdered,
  "Give more time to nominate": RotateCcw, "Open voting again": RotateCcw, [`Reopen this ${one}`]: RotateCcw, "Change the dates": CalendarClock,
  [`Stop choosing this ${one}`]: BookX, [`Stop ${verbing} this ${one}`]: BookX, [`Finish this ${one}`]: BookCheck, [`Go and finish this ${one}`]: BookCheck,
  "Arrange a meeting": CalendarPlus, "Arrange the meeting": CalendarPlus, "Find a date": CalendarSearch, "Suggest another time": CalendarPlus, "Add another time": Plus, "Add to my calendar": CalendarSync, "Stop looking for a date": CalendarX, "Choose this time": Check, "Cancel meeting": CalendarX, "Restore meeting": RotateCcw, "Mark as still to come": RotateCcw,
  "For administrators": SlidersHorizontal, "Mark all as read": CheckCheck, "Copy": Copy, "Copied": Check,
  "Help": CircleQuestionMark, "Help with this page": CircleQuestionMark, "Read the full guide": BookOpen,
  "Back to the club": ArrowLeft, [`Back to the ${one}`]: BookOpen, "Open": ArrowRight, "See all": ArrowRight,
  [`Open ${mine}`]: ArrowRight, [`Go to ${mine}`]: ArrowRight, "Go and start the vote": ArrowRight, "Go and count the votes": ArrowRight,
  "Decide what to do": ArrowRight, "Answer": ArrowRight, "Say when you can come": ArrowRight, "See the answers": ArrowRight, "Update my progress": BookOpen, [`Choose a different ${one}`]: Search, [`Enter the ${one} by hand`]: Pencil,
});

// Labels differ by kind of club ("Add a film"), and the icon follows the action.
const ACTIONS: Record<string, LucideIcon> = Object.assign({}, ...KINDS.map((k) => actions(words(k))));
const TRAILING = new Set<LucideIcon>([ArrowRight]);

/** A label with its icon, if that action has one. */
export function Labelled({ children }: { children: string }) {
  const glyph = Object.hasOwn(ACTIONS, children) ? ACTIONS[children] : undefined;
  if (!glyph) return <>{children}</>;
  return TRAILING.has(glyph) ? <>{children}<Icon of={glyph} /></> : <><Icon of={glyph} />{children}</>;
}
