export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export const validators = {
  email: (value: string): string | null => {
    if (!value) return 'Email is required';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) return 'Please enter a valid email';
    return null;
  },
  
  password: (value: string): string | null => {
    if (!value) return 'Password is required';
    if (value.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(value)) return 'Password must contain at least one uppercase letter';
    if (!/[a-z]/.test(value)) return 'Password must contain at least one lowercase letter';
    if (!/[0-9]/.test(value)) return 'Password must contain at least one number';
    return null;
  },
  
  required: (value: string, fieldName: string = 'This field'): string | null => {
    if (!value || value.trim().length === 0) return `${fieldName} is required`;
    return null;
  },
  
  phone: (value: string): string | null => {
    if (!value) return 'Phone number is required';
    const phoneRegex = /^[0-9]{10,15}$/;
    if (!phoneRegex.test(value.replace(/[\s-]/g, ''))) {
      return 'Please enter a valid phone number';
    }
    return null;
  },
  
  minLength: (value: string, min: number, fieldName: string = 'This field'): string | null => {
    if (!value || value.length < min) {
      return `${fieldName} must be at least ${min} characters`;
    }
    return null;
  },
  
  maxLength: (value: string, max: number, fieldName: string = 'This field'): string | null => {
    if (value && value.length > max) {
      return `${fieldName} must not exceed ${max} characters`;
    }
    return null;
  },
};

export const validateForm = (
  data: Record<string, string>,
  rules: Record<string, (value: string) => string | null>
): ValidationResult => {
  const errors: Record<string, string> = {};
  let isValid = true;

  Object.keys(rules).forEach((field) => {
    const error = rules[field](data[field] || '');
    if (error) {
      errors[field] = error;
      isValid = false;
    }
  });

  return { isValid, errors };
};
