export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const { to, subject, html, text } = options;

  const emailProvider = process.env.EMAIL_PROVIDER;

  if (!emailProvider || emailProvider === 'console') {
    console.log('=== EMAIL (dev mode) ===');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body: ${text || html}`);
    console.log('========================');
    return true;
  }

  if (emailProvider === 'resend') {
    return sendWithResend(options);
  }

  if (emailProvider === 'sendgrid') {
    return sendWithSendGrid(options);
  }

  console.error(`Unknown email provider: ${emailProvider}`);
  return false;
}

async function sendWithResend(options: EmailOptions): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY not configured');
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'noreply@sternhalma.com',
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Resend error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to send email with Resend:', error);
    return false;
  }
}

async function sendWithSendGrid(options: EmailOptions): Promise<boolean> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    console.error('SENDGRID_API_KEY not configured');
    return false;
  }

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: options.to }] }],
        from: { email: process.env.EMAIL_FROM || 'noreply@sternhalma.com' },
        subject: options.subject,
        content: [
          { type: 'text/plain', value: options.text || options.html },
          { type: 'text/html', value: options.html },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('SendGrid error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to send email with SendGrid:', error);
    return false;
  }
}

export function generateVerificationUrl(token: string): string {
  const baseUrl = process.env.SITE_URL || 'http://localhost:3000';
  return `${baseUrl}/auth/verify-email?token=${token}`;
}

export function generatePasswordResetUrl(token: string): string {
  const baseUrl = process.env.SITE_URL || 'http://localhost:3000';
  return `${baseUrl}/auth/reset-password?token=${token}`;
}

export function getVerificationEmailHtml(username: string, verificationUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your email</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #1a1a1a; margin: 0;">STERNHALMA</h1>
    <p style="color: #666; font-style: italic; margin: 5px 0 0 0;">Chinese Checkers</p>
  </div>

  <div style="background: #f9fafb; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h2 style="margin-top: 0;">Welcome, ${username}!</h2>
    <p>Thanks for creating an account. Please verify your email address to complete your registration.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${verificationUrl}"
         style="display: inline-block; background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        Verify Email Address
      </a>
    </div>

    <p style="color: #666; font-size: 14px;">
      This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
    </p>
  </div>

  <div style="text-align: center; color: #999; font-size: 12px;">
    <p>If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="word-break: break-all;">${verificationUrl}</p>
  </div>
</body>
</html>
`;
}

export function getPasswordResetEmailHtml(username: string, resetUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your password</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #1a1a1a; margin: 0;">STERNHALMA</h1>
    <p style="color: #666; font-style: italic; margin: 5px 0 0 0;">Chinese Checkers</p>
  </div>

  <div style="background: #f9fafb; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h2 style="margin-top: 0;">Password Reset Request</h2>
    <p>Hi ${username}, we received a request to reset your password.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}"
         style="display: inline-block; background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        Reset Password
      </a>
    </div>

    <p style="color: #666; font-size: 14px;">
      This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
    </p>
  </div>

  <div style="text-align: center; color: #999; font-size: 12px;">
    <p>If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="word-break: break-all;">${resetUrl}</p>
  </div>
</body>
</html>
`;
}
