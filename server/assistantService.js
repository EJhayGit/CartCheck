import { assistantErrorBody, parseAssistantOutput } from './assistantValidation.js'

const secondsUntil = (time, now) => Math.max(Math.ceil((Date.parse(time) - now) / 1000), 1)

// Reserve, ask the model, validate, and refund the account if there is no usable reply.
export async function respondToMessage(message, config, { reserve, interpret, refund, logError = console.error, now = Date.now }) {
  const reserved = await reserve()
  if (reserved.error) {
    const code = reserved.error === 'daily_limit' ? 'ASSISTANT_DAILY_LIMIT' : 'ASSISTANT_APP_LIMIT'
    return { status: 429, body: assistantErrorBody(code, { limit: config.dailyLimit }), retryAfter: secondsUntil(reserved.resetsAt, now()) }
  }
  const refundAccount = async () => {
    try { await refund(reserved.usageDate) }
    catch { logError('Assistant refund failed') }
  }
  let text
  try {
    text = await interpret(message)
  } catch (error) {
    // Our own status-only text, safe to log.
    logError(error.message)
    await refundAccount()
    if (error.code === 'provider_limit') return { status: 429, body: assistantErrorBody('ASSISTANT_PROVIDER_LIMIT') }
    return { status: 503, body: assistantErrorBody('ASSISTANT_UNAVAILABLE') }
  }
  const output = parseAssistantOutput(text)
  if (!output) {
    await refundAccount()
    return { status: 200, body: { intent: 'unusable', actions: [], usage: { ...reserved.usage, remaining: reserved.usage.remaining + 1 } } }
  }
  return { status: 200, body: { ...output, usage: reserved.usage } }
}
