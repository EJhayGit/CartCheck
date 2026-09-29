// A reset can revoke the current cookie, or a different account's sessions.
// Only the session endpoint can tell which account this browser still holds.
export async function revalidateCurrentSession({ getSession, getGeneration, maxAttempts = 3 }) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const generation = getGeneration()
    let outcome
    try {
      const result = await getSession()
      outcome = { status: 'authenticated', user: result.user }
    } catch (error) {
      outcome = error?.status === 401
        ? { status: 'unauthenticated' }
        : { status: 'unknown' }
    }
    if (getGeneration() === generation) return { ...outcome, generation }
  }
  return { status: 'unknown', generation: getGeneration() }
}

export async function resetAndRevalidate({ resetPassword, getSession, getGeneration, onResetSucceeded }) {
  await resetPassword()
  onResetSucceeded?.()
  return revalidateCurrentSession({ getSession, getGeneration })
}
