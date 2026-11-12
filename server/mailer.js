/**
 * Transactional email.
 *
 * Sends over Resend's HTTP API with plain `fetch` — no SDK dependency, so the
 * Vercel bundle stays as it is and a flaky email provider can never break
 * module load.
 *
 * Configuration:
 *   RESEND_API_KEY  provider API key. Without it, email-dependent features
 *                   (signup verification, password reset) switch off and new
 *                   accounts are created already verified so the app still works.
 *   MAIL_FROM       verified sender, e.g. "SlideAI <no-reply@yourdomain.com>".
 *                   Defaults to Resend's shared test sender, which only
 *                   delivers to the account owner.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

function apiKey() {
  return (process.env.RESEND_API_KEY || '').trim()
}

export function isEmailConfigured() {
  return Boolean(apiKey())
}

export async function sendEmail({ to, subject, html, text }) {
  const key = apiKey()
  if (!key) throw new Error('RESEND_API_KEY is not configured')

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || 'SlideAI <onboarding@resend.dev>',
      to: [to],
      subject,
      html,
      text,
    }),
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(
      `Email provider returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
    )
  }

  return res.json().catch(() => null)
}

/** Shared shell for code emails: one big, copyable number and nothing else. */
function codeEmailHtml({ heading, intro, code, outro }) {
  return `
    <div style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:28px 24px;color:#111827;">
      <p style="margin:0 0 20px;font-size:15px;font-weight:700;letter-spacing:-0.01em;">slideai</p>
      <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;letter-spacing:-0.02em;">${heading}</h1>
      <p style="margin:0 0 24px;font-size:14.5px;line-height:1.6;color:#4b5563;">${intro}</p>
      <p style="margin:0 0 8px;padding:18px 0;border-radius:14px;background:#eef2ff;color:#312e81;font-size:34px;font-weight:700;letter-spacing:0.32em;text-align:center;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${code}</p>
      <p style="margin:0 0 26px;font-size:12.5px;line-height:1.6;color:#6b7280;">This code expires in 10 minutes and works once.</p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:#9ca3af;">${outro}</p>
    </div>
  `.trim()
}

export async function sendVerificationCodeEmail({ to, code }) {
  const html = codeEmailHtml({
    heading: 'Confirm your email',
    intro: 'Enter this code to finish setting up your SlideAI account.',
    code,
    outro: "Didn't sign up? Ignore this email and the account will never be used.",
  })
  const text = [
    'Confirm your email',
    '',
    `Your SlideAI verification code is ${code}.`,
    'It expires in 10 minutes and works once.',
    '',
    "Didn't sign up? Ignore this email and the account will never be used.",
  ].join('\n')

  return sendEmail({ to, subject: `${code} is your SlideAI verification code`, html, text })
}

export async function sendPasswordResetCodeEmail({ to, code }) {
  const html = codeEmailHtml({
    heading: 'Reset your password',
    intro: 'Enter this code in SlideAI to choose a new password.',
    code,
    outro: "Didn't request this? Ignore this email — your password stays the same.",
  })
  const text = [
    'Reset your password',
    '',
    `Your SlideAI reset code is ${code}.`,
    'It expires in 10 minutes and works once.',
    '',
    "Didn't request this? Ignore this email — your password stays the same.",
  ].join('\n')

  return sendEmail({ to, subject: `${code} is your SlideAI reset code`, html, text })
}
