import { useRef, useState } from 'react';

interface HasIdBuilding {
    id: number;
    building_id: number;
    sort_order?: number;
}

/**
 * Live drag-to-reorder for grouped card grids (meters, chargers). While dragging,
 * the other cards in the same building shift out of the way so the final order is
 * visible before releasing. The order is only persisted on drop; a cancelled drag
 * (Escape / dropped outside) reverts.
 *
 * Reordering is scoped to the dragged card's building — cards never move between
 * buildings.
 */
export function useCardDnd<T extends HasIdBuilding>(params: {
    items: T[];
    enabled: boolean;
    /** Sort a group the normal (non-dragging) way, per the active sort mode. */
    sort: (list: T[]) => T[];
    /** Apply a new global id order to the items' sort_order in component state. */
    applyOrder: (orderedIds: number[]) => void;
    /** Persist the new global id order to the backend. */
    persist: (orderedIds: number[]) => void;
}) {
    const { items, enabled, sort, applyOrder, persist } = params;

    const [draggingId, setDraggingId] = useState<number | null>(null);
    const [drag, setDrag] = useState<{ buildingId: number; orderIds: number[] } | null>(null);
    const droppedRef = useRef(false);
    const lastOverRef = useRef<number | null>(null);

    const start = (buildingId: number, id: number) => {
        if (!enabled) return;
        const groupIds = sort(items.filter(i => i.building_id === buildingId)).map(i => i.id);
        setDrag({ buildingId, orderIds: groupIds });
        setDraggingId(id);
        droppedRef.current = false;
        lastOverRef.current = id;
    };

    // Called when the dragged card hovers over another card — moves the dragged
    // id to the hovered card's slot so the preview reorders live.
    const enter = (buildingId: number, hoveredId: number) => {
        if (!drag || drag.buildingId !== buildingId || draggingId == null) return;
        if (hoveredId === draggingId || hoveredId === lastOverRef.current) return;
        lastOverRef.current = hoveredId;

        const arr = [...drag.orderIds];
        const from = arr.indexOf(draggingId);
        const to = arr.indexOf(hoveredId);
        if (from === -1 || to === -1 || from === to) return;
        arr.splice(from, 1);
        arr.splice(to, 0, draggingId);
        setDrag({ buildingId, orderIds: arr });
    };

    const commit = () => {
        if (!drag) return;
        droppedRef.current = true;

        // Build the global id order: dragged building uses the preview order,
        // the others keep their normal sorted order.
        const buildingIds = Array.from(new Set(items.map(i => i.building_id)));
        const orderedIds: number[] = [];
        buildingIds.forEach(bid => {
            if (bid === drag.buildingId) {
                orderedIds.push(...drag.orderIds);
            } else {
                sort(items.filter(i => i.building_id === bid)).forEach(i => orderedIds.push(i.id));
            }
        });

        applyOrder(orderedIds);
        persist(orderedIds);
        setDrag(null);
        setDraggingId(null);
        lastOverRef.current = null;
    };

    const end = () => {
        // dragend fires after drop; if no drop happened (cancel / dropped outside),
        // discard the preview and revert to the committed order.
        if (!droppedRef.current) {
            setDrag(null);
            setDraggingId(null);
            lastOverRef.current = null;
        }
        droppedRef.current = false;
    };

    // Display order for a building group — the live preview while dragging that
    // group, otherwise the normal sorted order.
    const orderGroup = (buildingId: number, group: T[]): T[] => {
        if (drag && drag.buildingId === buildingId) {
            const byId = new Map(group.map(i => [i.id, i]));
            const ordered = drag.orderIds.map(id => byId.get(id)).filter(Boolean) as T[];
            group.forEach(i => { if (!drag.orderIds.includes(i.id)) ordered.push(i); });
            return ordered;
        }
        return sort(group);
    };

    return { draggingId, start, enter, commit, end, orderGroup };
}
