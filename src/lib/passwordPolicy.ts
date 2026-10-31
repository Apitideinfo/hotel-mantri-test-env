/**
 * Central Password Security Policy (M5)
 * Enforces minimum 12 characters and rejects common dictionary/guessable passwords.
 */
export const COMMON_PASSWORDS = new Set([
  'password1234',
  'password12345',
  'admin12345678',
  'hotel12345678',
  'hotelmantri12',
  'welcome123456',
  '123456789012',
  'qwertyuiop12',
  'letmein123456',
  'password@1234',
  'admin@123456',
]);

export const validatePasswordStrength = (pw: string): string | null => {
  if (!pw || pw.length < 12) {
    return 'Password must be at least 12 characters long.';
  }
  if (COMMON_PASSWORDS.has(pw.toLowerCase().trim())) {
    return 'Password is too common or easily guessable. Please choose a stronger password.';
  }
  return null;
};
