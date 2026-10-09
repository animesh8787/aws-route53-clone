/** Mirrors backend/app/core/security.py `password_problems`, so the sign-up form can show rules as they are met. */
export const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_BYTES = 72;
const COMMON = new Set(["password", "password1", "password123", "1234567890", "12345678910", "qwertyuiop", "qwerty12345", "iloveyou123", "admin12345", "letmein123", "welcome123", "abc1234567"]);

export interface PasswordRule {
  id: string;
  label: string;
  met: boolean;
}

export function passwordRules(password: string, email = ""): PasswordRule[] {
  const local = email.split("@")[0].toLowerCase();
  const lowered = password.toLowerCase();
  return [
    { id: "length", label: `At least ${MIN_PASSWORD_LENGTH} characters`, met: password.length >= MIN_PASSWORD_LENGTH },
    { id: "mix", label: "Contains a letter and a number", met: /[A-Za-z]/.test(password) && /\d/.test(password) },
    { id: "common", label: "Not a common password and does not contain your email name", met: password.length > 0 && !COMMON.has(lowered) && !(local.length >= 4 && lowered.includes(local)) },
    { id: "max", label: `At most ${MAX_PASSWORD_BYTES} characters`, met: new TextEncoder().encode(password).length <= MAX_PASSWORD_BYTES },
  ];
}

export const passwordIsValid = (password: string, email = "") => passwordRules(password, email).every((r) => r.met);
