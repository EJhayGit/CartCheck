import { ACCOUNT_TOKEN_TTL_MINUTES } from './authSecurity.js'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

function emailContent(kind, actionUrl) {
  const expiry = `${ACCOUNT_TOKEN_TTL_MINUTES} minutes`
  const verification = kind === 'verify_email'
  const subject = verification ? 'Verify your CartCheck email' : 'Reset your CartCheck password'
  const heading = verification ? 'Welcome to CartCheck!' : 'Reset your password'
  const intro = verification
    ? 'Thanks for creating an account. Please verify your email address to finish setting up your account.'
    : 'We received a request to reset your CartCheck password.'
  const action = verification ? 'Verify Email Address' : 'Reset Password'
  const fallback = verification ? 'verification' : 'password reset'
  const reassurance = verification
    ? "Didn't create an account? You can safely ignore this email."
    : "If you didn't request this change, you can ignore this email. Your existing password will remain unchanged unless the reset is completed."
  const safeUrl = escapeHtml(actionUrl)

  const text = `CARTCHECK

${heading}

${intro}

${action}: ${actionUrl}

This link expires in ${expiry}.

${reassurance}

CartCheck
Your grocery shopping companion.`

  const html = `<!doctype html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#F4F7F4;color:#172B26;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" lang="en" dir="ltr" style="width:100%;background-color:#F4F7F4;">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="580" style="width:100%;max-width:580px;background-color:#FFFFFF;border:1px solid #D7E2D9;border-radius:10px;">
          <tr>
            <td style="padding:36px 32px 32px;">
              <p style="margin:0 0 28px;color:#176B45;font-size:16px;font-weight:700;letter-spacing:2px;line-height:24px;">CARTCHECK</p>
              <h1 style="margin:0 0 16px;color:#172B26;font-size:26px;font-weight:700;line-height:34px;">${heading}</h1>
              <p style="margin:0 0 26px;color:#172B26;font-size:16px;line-height:25px;">${intro}</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;">
                <tr>
                  <td align="center" bgcolor="#176B45" style="background-color:#176B45;border-radius:8px;">
                    <a href="${safeUrl}" style="display:inline-block;padding:14px 24px;color:#FFFFFF;font-size:16px;font-weight:700;line-height:22px;text-align:center;text-decoration:none;">${action}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 10px;color:#42584E;font-size:14px;line-height:22px;">This link expires in ${expiry}.</p>
              <p style="margin:0 0 6px;color:#42584E;font-size:14px;line-height:22px;">If the button does not work, use this ${fallback} link:</p>
              <p style="margin:0 0 26px;font-size:14px;line-height:22px;overflow-wrap:anywhere;word-break:break-all;">
                <a href="${safeUrl}" style="color:#176B45;text-decoration:underline;overflow-wrap:anywhere;word-break:break-all;">${safeUrl}</a>
              </p>
              <p style="margin:0;padding-top:24px;border-top:1px solid #D7E2D9;color:#42584E;font-size:14px;line-height:22px;">${reassurance}</p>
            </td>
          </tr>
        </table>
        <p style="margin:20px 0 0;color:#42584E;font-size:13px;line-height:20px;">CartCheck<br>Your grocery shopping companion.</p>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, text, html }
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

    const endpoint = process.env.NODE_ENV === 'test'
      ? (process.env.RESEND_API_URL || RESEND_ENDPOINT)
      : RESEND_ENDPOINT
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], ...emailContent(kind, actionUrl) }),
    })
    if (!response.ok) throw new Error(`Email provider returned ${response.status}`)
  }
}

export const sendAccountEmail = createEmailService()
