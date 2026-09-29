const RESEND_ENDPOINT = 'https://api.resend.com/emails'

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

export function createEmailService({ fetchImpl = fetch, devSink = (kind) => {
  // Development sink deliberately discards message contents and token URLs.
  console.info(`Development email sink accepted ${kind} message`)
} } = {}) {
  return async function sendAccountEmail({ to, kind, actionUrl }) {
    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.EMAIL_FROM
    if (!apiKey || !from) {
      if (process.env.NODE_ENV === 'production') throw new Error('Email delivery is not configured')
      await devSink(kind)
      return
    }

    const subject = kind === 'verify_email' ? 'Verify your CartCheck email' : 'Reset your CartCheck password'
    const action = kind === 'verify_email' ? 'Verify email address' : 'Reset password'
    const endpoint = process.env.NODE_ENV === 'test'
      ? (process.env.RESEND_API_URL || RESEND_ENDPOINT)
      : RESEND_ENDPOINT
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text: `${action}: ${actionUrl}\n\nThis link expires in 30 minutes. If you did not request this, you can ignore this email.`,
        html: `<p><a href="${escapeHtml(actionUrl)}">${action}</a></p><p>This link expires in 30 minutes. If you did not request this, you can ignore this email.</p>`,
      }),
    })
    if (!response.ok) throw new Error(`Email provider returned ${response.status}`)
  }
}

export const sendAccountEmail = createEmailService()
