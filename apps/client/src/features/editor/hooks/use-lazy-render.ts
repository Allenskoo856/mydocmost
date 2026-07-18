import { useEffect, useState } from "react";
import { useIntersection } from "@mantine/hooks";

const OBSERVER_OPTIONS: IntersectionObserverInit = {
  // Render heavy content slightly before it enters the viewport to avoid
  // visible pop-in while scrolling.
  rootMargin: "600px 0px",
  threshold: 0,
};

/**
 * Defers expensive node-view rendering (KaTeX, mermaid diagrams, embed
 * iframes) until the element scrolls near the viewport. Once visible it stays
 * rendered, to avoid re-render churn when scrolling back and forth.
 */
export function useLazyRender<T extends HTMLElement = HTMLDivElement>() {
  const { ref, entry } = useIntersection<T>(OBSERVER_OPTIONS);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);

  useEffect(() => {
    if (entry?.isIntersecting) {
      setHasBeenVisible(true);
    }
  }, [entry?.isIntersecting]);

  return { ref, shouldRender: hasBeenVisible };
}
