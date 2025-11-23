import { useState } from 'react';

export function useExpandedComplexes() {
  const [expandedComplexes, setExpandedComplexes] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem('expandedComplexes');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const toggleComplex = (complexId: number) => {
    const newExpanded = new Set(expandedComplexes);
    if (newExpanded.has(complexId)) {
      newExpanded.delete(complexId);
    } else {
      newExpanded.add(complexId);
    }
    setExpandedComplexes(newExpanded);
    
    // Persist to localStorage
    try {
      localStorage.setItem('expandedComplexes', JSON.stringify(Array.from(newExpanded)));
    } catch (err) {
      console.error('Failed to save expanded state:', err);
    }
  };

  return {
    expandedComplexes,
    toggleComplex
  };
}