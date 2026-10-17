import type { Shape } from "../flat";

/**
 * The stamp editor (features/app/stamp-drawer.tsx): its tools and their
 * hints, the rims, and what it asks before a drawing is dropped.
 */

const de = {
  draw: {
    title: "Neuer Stempel",
    name: "Name (optional)",
    namePlaceholder: "z. B. Sport, Regentag, Kuss …",
    color: "Farbe",
    shape: "Form",
    undo: "Zurück",
    redo: "Wiederholen",
    clear: "Leeren",
    // Closing (or going back) with something drawn – it asks first.
    leaveTitle: "Zeichnung verwerfen?",
    leaveText: "Was du gezeichnet hast, ist dann weg.",
    leaveStay: "Weiter malen",
    leaveGo: "Verwerfen",
    // A stamp of one's own, open in the editor again.
    editTitle: "Stempel bearbeiten",
    editLeaveTitle: "Änderungen verwerfen?",
    editLeaveText: "Dein Stempel bleibt dann, wie er war.",
    editNote:
      "Alle seine Abdrücke ändern sich mit – auch bei allen, die ihn von dir übernommen haben.",
    saveChanges: "Änderungen speichern",
    tools: "Werkzeuge",
    pen: "Stift",
    eraser: "Radiergummi",
    move: "Auswählen & verschieben",
    moveHint:
      "Neben einer Ecke ziehen dreht · ⇧ gerade, im Verhältnis, 15° · Alt kopiert · Entf löscht",
    moveHintTouch:
      "Antippen wählt, ziehen schiebt · Griffe: Größe · Knopf oben: drehen",
    remove: "Entfernen",
    removeSelection: "Auswahl entfernen",
    penHint:
      "⇧ zieht eine gerade Linie · ⌘/Strg + Scrollen zoomt, Leertaste + Ziehen verschiebt",
    penHintTouch: "Mit zwei Fingern zoomen und verschieben",
    zoomReset: "Zurück auf 100 %",
    eraserHint: "Nimmt Linien und Flächen weg – den Rand nie",
    line: "Linie",
    lineHint:
      "Klicken setzt Punkte für gerade Linien, Ziehen biegt sie zur Kurve · ⇧ 45° · Enter beendet",
    lineHintTouch:
      "Tippen setzt Punkte, Ziehen biegt zur Kurve · einen Punkt antippen und ziehen verschiebt ihn",
    finish: "Fertig",
    points: "Punkte bearbeiten",
    pointsHint:
      "Punkte und Griffe ziehen · Alt-Klick: rund oder eckig · Klick auf die Linie: neuer Punkt · Entf löscht",
    pointsHintTouch:
      "Punkt antippen wählt ihn · Punkte und Griffe ziehen · auf die Linie tippen: neuer Punkt",
    removePoint: "Punkt entfernen",
    // A point of a line: its handles together (round) or apart (corner).
    anchor: "Punkt",
    anchorSmooth: "Rund",
    anchorCorner: "Ecke",
    anchorSmoothHint: "Griffe gekoppelt",
    anchorCornerHint: "Griffe getrennt",
    width: "Strichstärke",
    widths: {
      hair: "Haarfein",
      thin: "Fein",
      medium: "Mittel",
      thick: "Dick",
    },
    // Shapes to drag into the drawing (Content → Drawing templates).
    templates: "Formen zum Hineinziehen",
    templatesHint: "In die Fläche ziehen oder anklicken",
    templatesHintTouch: "Antippen legt sie in die Mitte",
    upload: "SVG hochladen",
    inverted: "Invertiert",
    special: "Special – glitzert",
    rim: "Rahmen",
    rims: {
      plain: "Glatt",
      dashed: "Gestrichelt",
      dotted: "Gepunktet",
      wave: "Welle",
      zigzag: "Zacken",
      scallop: "Bögen",
      double: "Doppelt",
    },
    uploadFailed: "Mit dieser Datei kann ich nichts anfangen.",
    save: "Stempel speichern",
    cancel: "Abbrechen",
    back: "Weiter malen",
    shared: "Die anderen in diesem Kalender dürfen auch damit stempeln",
    hint: "Mal hier drauf!",
    make3d: "Fertig – mach ihn 3D",
    done: "Ta-da! Dein Stempel",
    turn: "Zum Drehen ziehen",
  },
};

const en: Shape<typeof de> = {
  draw: {
    title: "New stamp",
    name: "Name (optional)",
    namePlaceholder: "e.g. workout, rainy day, kiss …",
    color: "Color",
    shape: "Shape",
    undo: "Undo",
    redo: "Redo",
    clear: "Clear",
    leaveTitle: "Throw the drawing away?",
    leaveText: "What you've drawn will be gone.",
    leaveStay: "Keep drawing",
    leaveGo: "Throw away",
    editTitle: "Edit stamp",
    editLeaveTitle: "Throw the changes away?",
    editLeaveText: "Your stamp stays as it was.",
    editNote:
      "All its prints change along – for everyone who took it from you, too.",
    saveChanges: "Save changes",
    tools: "Tools",
    pen: "Pen",
    eraser: "Eraser",
    move: "Select & move",
    moveHint:
      "Drag beside a corner to turn · ⇧ straight, in proportion, 15° · Alt copies · Del removes",
    moveHintTouch: "Tap picks, drag moves · handles: size · knob on top: turn",
    remove: "Remove",
    removeSelection: "Remove selection",
    penHint:
      "⇧ draws a straight line · ⌘/Ctrl + scroll zooms, space + drag moves",
    penHintTouch: "Two fingers zoom and move",
    zoomReset: "Back to 100%",
    eraserHint: "Takes away lines and areas – never the rim",
    line: "Line",
    lineHint:
      "Click sets points for straight lines, dragging bends them into a curve · ⇧ 45° · Enter ends",
    lineHintTouch:
      "Tap sets points, dragging bends into a curve · tap and drag a point to move it",
    finish: "Done",
    points: "Edit points",
    pointsHint:
      "Drag points and handles · Alt-click: smooth or corner · click the line: new point · Del removes",
    pointsHintTouch:
      "Tap a point to pick it · drag points and handles · tap the line: new point",
    removePoint: "Remove point",
    anchor: "Point",
    anchorSmooth: "Round",
    anchorCorner: "Corner",
    anchorSmoothHint: "Handles together",
    anchorCornerHint: "Handles apart",
    width: "Line width",
    widths: {
      hair: "Hairline",
      thin: "Thin",
      medium: "Medium",
      thick: "Thick",
    },
    templates: "Shapes to drag in",
    templatesHint: "Drag onto the drawing or click",
    templatesHintTouch: "Tap to put one in the middle",
    upload: "Upload SVG",
    inverted: "Inverted",
    special: "Special – sparkly",
    rim: "Rim",
    rims: {
      plain: "Plain",
      dashed: "Dashed",
      dotted: "Dotted",
      wave: "Wave",
      zigzag: "Zigzag",
      scallop: "Scallops",
      double: "Double",
    },
    uploadFailed: "I can't make anything of this file.",
    save: "Save stamp",
    cancel: "Cancel",
    back: "Keep drawing",
    shared: "The others in this calendar may stamp with it too",
    hint: "Draw on here!",
    make3d: "Done – make it 3D",
    done: "Ta-da! Your stamp",
    turn: "Drag to turn it",
  },
};

export const drawTexts = { de, en };
