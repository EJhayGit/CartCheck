import zxcvbn from 'zxcvbn'

export function passwordStrength(password, email = '') {
  if (!password) return null
  // Local only. Do not retain the estimator result, which includes the password.
  const score = zxcvbn(password.slice(0, 72), [email, email.split('@')[0], 'cartcheck']).score
  const length = Array.from(password).length
  const level = length < 8 ? 0 : Math.min(length < 12 ? 2 : 3, Math.max(0, score - 1))
  return [
    { label: 'Weak', guidance: "Try a longer password that's harder to guess." },
    { label: 'Fair', guidance: 'Good start! Adding more characters can make it stronger.' },
    { label: 'Good', guidance: 'Your password is looking good.' },
    { label: 'Strong', guidance: 'Strong password!' },
  ].map((item, index) => ({ ...item, level: index + 1 }))[level]
}
