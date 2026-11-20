// Text layout shared by the editor, the inspector warnings and export. Pure:
// the caller injects a measuring function (canvas in the browser, a stub in tests).
import type { TextElement } from "./types.ts";

export type Measure = (text: string, font: string, letterSpacing: number) => number;

type FontProps = Pick<TextElement, "italic" | "fontWeight" | "fontSize" | "fontFamily">;

export function fontString(el: FontProps, scale = 1): string {
  return `${el.italic ? "italic " : ""}${el.fontWeight} ${el.fontSize * scale}px "${el.fontFamily}", sans-serif`;
}

export function displayText(el: Pick<TextElement, "text" | "uppercase">): string {
  return el.uppercase ? el.text.toUpperCase() : el.text;
}

export interface TextLine {
  text: string;
  width: number;
  /** Top of the line box, relative to the element. */
  top: number;
}

export interface TextLayout {
  lines: TextLine[];
  /** Total height of all line boxes and paragraph gaps. */
  height: number;
  lineHeightPx: number;
  /** A single word is wider than the box and cannot wrap. */
  overflowX: boolean;
  maxLineWidth: number;
}

type LayoutProps = FontProps &
  Pick<TextElement, "text" | "uppercase" | "width" | "lineHeight" | "letterSpacing" | "paragraphSpacing">;

export function layoutText(el: LayoutProps, measure: Measure): TextLayout {
  const font = fontString(el);
  const ls = el.letterSpacing;
  const lineHeightPx = el.fontSize * el.lineHeight;
  const maxWidth = el.width + 0.5; // tolerate sub-pixel rounding
  const lines: TextLine[] = [];
  let overflowX = false;
  let top = 0;

  const paragraphs = displayText(el).split(/\r?\n/);
  paragraphs.forEach((para, pi) => {
    if (pi > 0) top += el.paragraphSpacing;
    const words = para.split(" ");
    let current: string | null = null;
    const push = (text: string) => {
      lines.push({ text, width: measure(text, font, ls), top });
      top += lineHeightPx;
    };
    for (const word of words) {
      if (current === null) {
        current = word;
      } else {
        const candidate: string = `${current} ${word}`;
        if (measure(candidate, font, ls) <= maxWidth) current = candidate;
        else {
          push(current);
          current = word;
        }
      }
      if (word && measure(word, font, ls) > maxWidth) overflowX = true;
    }
    push(current ?? "");
  });

  return {
    lines,
    height: Math.max(top, lineHeightPx),
    lineHeightPx,
    overflowX,
    maxLineWidth: lines.reduce((m, l) => Math.max(m, l.width), 0),
  };
}

/** x offset of a line inside the box for the given alignment. */
export function lineOffset(align: TextElement["align"], boxWidth: number, lineWidth: number): number {
  if (align === "center") return (boxWidth - lineWidth) / 2;
  if (align === "right") return boxWidth - lineWidth;
  return 0;
}
