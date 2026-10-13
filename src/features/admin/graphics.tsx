/**
 * Boop's mark in the admin, where Payload's own would be: the word mark over
 * the login, and the app icon's “b” with its dot at the start of the path on
 * top of every page.
 *
 * Drawn, not written: the site's logo (components/ui.tsx) is the word set in
 * Satoshi, a font the admin doesn't load. The lines are those of the picture
 * for shared links ((site)/opengraph-image.tsx) and of the app icon
 * (public/icon.svg) – change one, change them all.
 *
 * In the admin's ink, no color of our own: `--theme-elevation-900` is Boop's
 * #141414 on white in the light theme, and white on #141414 in the dark one.
 */

const INK = "var(--theme-elevation-900)";

/** The marker: round ends, as thick as the app icon's. */
const MARKER = {
  fill: "none",
  strokeLinecap: "round",
  strokeWidth: 34,
} as const;

/** The logo's dot – the blob from the doodles (components/doodles.tsx). */
const DOT =
  "M12.2 3.4C17.3 3.2 20.9 7 20.6 12.1C20.3 17 16.8 20.7 11.8 20.6C6.9 20.5 3.3 16.9 3.4 11.9C3.5 7.2 7.3 3.6 12.2 3.4Z";

/**
 * Over the login: “boop” and its dot. The picture (viewBox) holds the whole
 * line with a little air around it, 20 : 9 – as its size is.
 */
export const AdminLogo = () => (
  <svg
    aria-label="Boop"
    height={72}
    role="img"
    viewBox="14 -3 600 270"
    width={160}
  >
    <g {...MARKER} stroke={INK}>
      <path d="M34 17V168" />
      <circle cx={78} cy={124} r={44} />
      <circle cx={214} cy={124} r={44} />
      <circle cx={350} cy={124} r={44} />
      <path d="M442 80V246" />
      <circle cx={486} cy={124} r={44} />
    </g>
    <path d={DOT} fill={INK} transform="translate(556 140) scale(2.6)" />
  </svg>
);

/**
 * On top of every page, the way back to the dashboard: the app icon's “b”
 * and dot, without its tile. It fills the little square Payload gives it –
 * so its picture is a square, too, the mark in the middle; the link around
 * it says where it goes.
 *
 * Payload draws it into the picture of a shared admin link, too (/api/og),
 * and names the color there (`fill`) – a picture has no theme.
 */
export const AdminIcon = ({ fill = INK }: { fill?: string }) => (
  <svg aria-hidden="true" height="100%" viewBox="11 -3 191 191" width="100%">
    <g {...MARKER} stroke={fill}>
      <path d="M34 17V168" />
      <circle cx={78} cy={124} r={44} />
    </g>
    <path d={DOT} fill={fill} transform="translate(142 131) scale(2.6)" />
  </svg>
);
