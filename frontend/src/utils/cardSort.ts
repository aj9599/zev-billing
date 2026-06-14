// Shared sorting for meter and charger cards. "custom" follows the user-defined
// sort_order (set by drag-to-reorder); the other modes are computed rules.
export type CardSortMode = 'custom' | 'name' | 'type' | 'created';

interface SortAccessors<T> {
    name: (t: T) => string;
    type: (t: T) => string;
    created: (t: T) => string;
    order: (t: T) => number;
    id: (t: T) => number;
}

export function sortCards<T>(items: T[], mode: CardSortMode, get: SortAccessors<T>): T[] {
    const arr = [...items];
    switch (mode) {
        case 'name':
            arr.sort((a, b) => get.name(a).localeCompare(get.name(b)) || get.id(a) - get.id(b));
            break;
        case 'type':
            arr.sort((a, b) =>
                get.type(a).localeCompare(get.type(b)) ||
                get.name(a).localeCompare(get.name(b)));
            break;
        case 'created':
            arr.sort((a, b) => (get.created(a) || '').localeCompare(get.created(b) || '') || get.id(a) - get.id(b));
            break;
        case 'custom':
        default:
            arr.sort((a, b) => get.order(a) - get.order(b) || get.id(a) - get.id(b));
            break;
    }
    return arr;
}

// Read/write the persisted sort mode for a page (localStorage).
export function loadSortMode(key: string): CardSortMode {
    const v = localStorage.getItem(key);
    return (v === 'custom' || v === 'name' || v === 'type' || v === 'created') ? v : 'custom';
}
