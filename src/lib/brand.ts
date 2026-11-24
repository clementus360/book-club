/**
 * The product's name and the words around it. Everything people see takes them
 * from here, so a rename is one change. (Tests still look for the current name.)
 */
export const BRAND = {
  name: "Commonplace",
  // How the name is set in the header.
  wordmark: "CommonPlace",
  tagline: "Good stories. Better conversations.",
  description: "A private place for a book, film, TV, anime or game club to choose together, enjoy it together, and keep a record of the conversation.",
  // From globals.css: the brand's cream, navy and orange (Branding/CommonPlace.pdf).
  // Used where the stylesheet cannot reach: emails, the share image, the error page.
  colors: { paper: "#e9e6dc", sheet: "#f6f5f0", ink: "#072935", soft: "#4f5f66", rule: "#d4d1c4", leaf: "#072935", rubric: "#b83516", flame: "#f24d28" },
} as const;
