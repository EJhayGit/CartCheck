export const PASSWORD_HINT = 'Use at least 8 characters. 10 or more is recommended.'

// bcrypt uses at most 72 UTF-8 bytes. Validate rather than truncate.
export function passwordError(password) {
  if (Array.from(password).length < 8) return 'Use at least 8 characters.'
  if (new TextEncoder().encode(password).length > 72) return 'Use a password of 72 UTF-8 bytes or fewer (some characters use more than one byte).'
  return ''
}

export function confirmationError(password, confirmation) {
  if (!confirmation) return 'Confirm your password.'
  return password === confirmation ? '' : 'Passwords do not match.'
}
