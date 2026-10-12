import { drawScribbles } from "./scribble-draw";

/**
 * The marker (scribble-draw.ts), started at the top of every page – mounted
 * once per page (the language's layout). Inline, as its source text: it runs
 * while the page is parsed, so the frames the server sent are drawn before
 * the first paint – offline too, as the page is kept whole. Without it (no
 * script) every frame stays the plain CSS box it is made of.
 *
 * In development it waits for React to hydrate each element first: there a
 * mark made earlier on the server's HTML would read as a hydration mismatch.
 * In production React doesn't compare, and nothing waits.
 */
const SCRIPT = `(${drawScribbles.toString()})(${process.env.NODE_ENV !== "production"})`;

export const ScribbleDefs = () => (
  <script
    // biome-ignore lint/security/noDangerouslySetInnerHtml: our own code, as text – it has to run before any bundle does
    dangerouslySetInnerHTML={{ __html: SCRIPT }}
  />
);
