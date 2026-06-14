import { useLayoutEffect, useRef } from 'react';

/**
 * FLIP animation for reordering card grids. Attach the returned ref to a
 * container and give each card a `data-flip-id`. On every render, each card that
 * moved is animated from its previous position to the new one with the Web
 * Animations API — so during drag-to-reorder the cards slide smoothly into place.
 *
 * Using element.animate() (not inline transforms) keeps React's style management
 * and any CSS entry animations from conflicting with the slide.
 *
 * `active` gates the effect to the sortable view so cards don't slide on
 * unrelated re-renders (status polling, filter changes).
 */
export function useFlipReorder<T extends HTMLElement>(active: boolean) {
    const containerRef = useRef<T | null>(null);
    const prev = useRef<Map<string, DOMRect>>(new Map());

    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const els = Array.from(container.querySelectorAll<HTMLElement>('[data-flip-id]'));
        const next = new Map<string, DOMRect>();

        els.forEach(el => {
            const id = el.dataset.flipId!;
            const rect = el.getBoundingClientRect();
            next.set(id, rect);

            if (!active) return;
            const before = prev.current.get(id);
            if (!before) return;

            const dx = before.left - rect.left;
            const dy = before.top - rect.top;
            if (dx === 0 && dy === 0) return;

            el.animate(
                [
                    { transform: `translate(${dx}px, ${dy}px)` },
                    { transform: 'translate(0, 0)' }
                ],
                { duration: 180, easing: 'ease-out' }
            );
        });

        prev.current = next;
    });

    return containerRef;
}
