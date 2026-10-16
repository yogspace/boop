"use client";

import { createContext, type ReactNode, use } from "react";
import {
  DEFAULT_SHAPES,
  getShapes,
  type StampShapeDef,
  setShapes,
} from "./shapes";
import {
  DEFAULT_TEMPLATES,
  type DrawingTemplate,
  getTemplates,
  setTemplates,
} from "./templates";

const ShapesContext = createContext<{
  shapes: readonly StampShapeDef[];
  templates: readonly DrawingTemplate[];
}>({ shapes: DEFAULT_SHAPES, templates: DEFAULT_TEMPLATES });

/**
 * Puts the CMS's stamp shapes and drawing templates in use for everything
 * below – set right while rendering, like the colors (palette-provider.tsx):
 * the first render on the server and the one in the browser already have
 * them. Setting the same again changes nothing.
 */
export const ShapesProvider = ({
  shapes,
  templates,
  children,
}: {
  /** From the server: `getSite().stampShapes`. */
  shapes: readonly StampShapeDef[];
  /** From the server: `getSite().drawingTemplates`. */
  templates: readonly DrawingTemplate[];
  children: ReactNode;
}) => {
  setShapes(shapes);
  setTemplates(templates);
  return (
    <ShapesContext value={{ shapes: getShapes(), templates: getTemplates() }}>
      {children}
    </ShapesContext>
  );
};

/**
 * The shapes to pick from – for what lists them (the editor), so it draws
 * anew when they change. A single shape needs no hook: outline.ts finds it
 * by its key.
 */
export const useShapes = () => use(ShapesContext).shapes;

/** The shapes to drag into a drawing. */
export const useTemplates = () => use(ShapesContext).templates;
