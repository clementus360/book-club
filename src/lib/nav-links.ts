import { words, type Kind } from "./kinds";

/** The menu, worded for the kind of club. A plain module, so the server layout can call it. */
export const clubLinks = (kind: Kind) => [
  ["/app", "Home"], ["/app/current-book", words(kind).ours], ["/app/meetings", "Meetings"], ["/app/library", "Club shelf"], ["/app/members", "Members"],
] as const;
export const ownLinks = (kind: Kind) => [["/app/my-library", words(kind).mine], ["/app/recommendations", "Recommendations"]] as const;
