import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { sendEmail } from "./lib/email";

function getVerificationCodeEmailHtml(code: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your verification code</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #1a1a1a; margin: 0;">STERNHALMA</h1>
    <p style="color: #666; font-style: italic; margin: 5px 0 0 0;">Chinese Checkers</p>
  </div>

  <div style="background: #f9fafb; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h2 style="margin-top: 0;">Verify your email</h2>
    <p>Enter this code to verify your email address:</p>

    <div style="text-align: center; margin: 30px 0;">
      <span style="display: inline-block; background: #2563eb; color: white; padding: 16px 32px; border-radius: 8px; font-size: 32px; font-weight: 700; letter-spacing: 8px; font-family: monospace;">
        ${code}
      </span>
    </div>

    <p style="color: #666; font-size: 14px;">
      This code will expire in 15 minutes. If you didn't create an account, you can safely ignore this email.
    </p>
  </div>
</body>
</html>
`;
}

const CustomPassword = Password({
  profile(params) {
    return {
      email: params.email as string,
      name: (params.name as string) || (params.email as string).split("@")[0],
    };
  },
  validatePasswordRequirements(password) {
    if (typeof password !== "string") throw new Error("Password is required");
    if (password.length < 8)
      throw new Error("Password must be at least 8 characters");
    if (password.length > 128)
      throw new Error("Password must be 128 characters or less");
    if (!/[a-z]/.test(password))
      throw new Error("Password must contain at least one lowercase letter");
    if (!/[A-Z]/.test(password))
      throw new Error("Password must contain at least one uppercase letter");
    if (!/[0-9]/.test(password))
      throw new Error("Password must contain at least one number");
  },
  verify: {
    id: "verification-code",
    type: "email" as const,
    name: "Verification Code",
    maxAge: 60 * 15, // 15 minutes
    async generateVerificationToken() {
      return Array.from({ length: 6 }, () =>
        Math.floor(Math.random() * 10)
      ).join("");
    },
    async sendVerificationRequest({ identifier: email, token }) {
      const html = getVerificationCodeEmailHtml(token);
      const sent = await sendEmail({
        to: email,
        subject: "Your Sternhalma verification code",
        html,
        text: `Your Sternhalma verification code is: ${token}`,
      });
      if (!sent) {
        throw new Error("Failed to send verification email");
      }
    },
  },
});

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [CustomPassword],
});
