/**
 * Password validation utility
 * Enforces strong password requirements
 */

export const PASSWORD_REQUIREMENTS = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: true,
};

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
  strength: 'weak' | 'fair' | 'good' | 'strong';
}

/**
 * Validate password against security requirements
 */
export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (!password) {
    errors.push('Password is required');
    return { valid: false, errors, strength: 'weak' };
  }

  // Length check
  if (password.length < PASSWORD_REQUIREMENTS.minLength) {
    errors.push(`At least ${PASSWORD_REQUIREMENTS.minLength} characters required`);
  }

  // Uppercase check
  if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('At least one uppercase letter (A-Z) required');
  }

  // Lowercase check
  if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('At least one lowercase letter (a-z) required');
  }

  // Number check
  if (PASSWORD_REQUIREMENTS.requireNumber && !/[0-9]/.test(password)) {
    errors.push('At least one number (0-9) required');
  }

  // Special character check
  if (
    PASSWORD_REQUIREMENTS.requireSpecial &&
    !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)
  ) {
    errors.push('At least one special character (!@#$%^&* etc.) required');
  }

  // Calculate strength
  let strength: 'weak' | 'fair' | 'good' | 'strong' = 'weak';
  const passedChecks = [
    password.length >= PASSWORD_REQUIREMENTS.minLength,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /[0-9]/.test(password),
    /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
  ].filter(Boolean).length;

  if (passedChecks >= 5) strength = 'strong';
  else if (passedChecks >= 4) strength = 'good';
  else if (passedChecks >= 3) strength = 'fair';

  return {
    valid: errors.length === 0,
    errors,
    strength,
  };
}

/**
 * Format password requirements as readable text
 */
export function getPasswordRequirementsText(): string {
  const reqs = [];
  if (PASSWORD_REQUIREMENTS.minLength) {
    reqs.push(`At least ${PASSWORD_REQUIREMENTS.minLength} characters`);
  }
  if (PASSWORD_REQUIREMENTS.requireUppercase) {
    reqs.push('Uppercase letter (A-Z)');
  }
  if (PASSWORD_REQUIREMENTS.requireLowercase) {
    reqs.push('Lowercase letter (a-z)');
  }
  if (PASSWORD_REQUIREMENTS.requireNumber) {
    reqs.push('Number (0-9)');
  }
  if (PASSWORD_REQUIREMENTS.requireSpecial) {
    reqs.push('Special character (!@#$%^&* etc.)');
  }
  return reqs.join(', ');
}
