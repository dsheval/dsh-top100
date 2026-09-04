import { useEffect, useId, useRef, useState } from "react";
import type { Translate } from "./locales.js";

/** Measure actual wrapping: short summaries need no extra control. */
export function DescriptionPreview({ text, t }: { text: string; t: Translate }) {
  const id = useId();
  const element = useRef<HTMLSpanElement>(null);
  const [expandedText, setExpandedText] = useState<string | null>(null);
  const [overflows, setOverflows] = useState(false);
  const expanded = expandedText === text;

  useEffect(() => {
    const target = element.current;
    if (!target) return;
    const measure = () => {
      const lineHeight = Number.parseFloat(getComputedStyle(target).lineHeight);
      setOverflows(target.scrollHeight > lineHeight * 2 + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => observer.disconnect();
  }, [text]);

  return (
    <div className={`desc description-preview${expanded ? " is-expanded" : ""}`}>
      <span ref={element} id={id} className="description-text">{text}</span>
      {overflows || expanded ? (
        <button
          type="button"
          className="description-toggle"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpandedText(expanded ? null : text)}
        >
          {t(expanded ? "collapseDescription" : "expandDescription")}
        </button>
      ) : null}
    </div>
  );
}
