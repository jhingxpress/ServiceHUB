/**
 * Convert a string to Title Case.
 * Handles common acronyms (HVAC, IT) and preserves ampersands.
 * Use for displaying database category names that are stored in ALL CAPS.
 */
export const toTitleCase = (str: string | undefined | null): string => {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/\b\w+\b/g, (word) => {
      if (word === 'hvac') return 'HVAC';
      if (word === 'it') return 'IT';
      if (word === 'id') return 'ID';
      return word.charAt(0).toUpperCase() + word.slice(1);
    });
};
