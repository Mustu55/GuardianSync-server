const nodemailer = require('nodemailer');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

let transporter;

async function initTransporter() {
  if (!transporter) {
    const smtpUser = process.env.SMTP_USER || '';
    const smtpPass = process.env.SMTP_PASS || '';

    if (smtpUser && smtpPass) {
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 8000,
      });
      await transporter.verify();
      console.log('📧 Gmail SMTP transporter initialized and verified.');
    } else {
      console.log('⚠️ No SMTP_USER or SMTP_PASS found in .env. Email sending is disabled.');
      return null;
    }
  }
  return transporter;
}

async function sendOtpEmail(toEmail, otpCode) {
  try {
    const tp = await initTransporter();

    // If no real SMTP config, just mock it instantly to avoid timeouts
    if (!tp) {
      console.log(`\n==========================================`);
      console.log(`✉️  [MOCK] No SMTP configured. Add SMTP_USER and SMTP_PASS to .env`);
      console.log(`🔑 OTP Code for ${toEmail}: ${otpCode}`);
      console.log(`==========================================\n`);
      return true;
    }

    const smtpUser = process.env.SMTP_USER || '';
    const info = await tp.sendMail({
      from: `"GuardianSync Security" <${smtpUser}>`,
      to: toEmail,
      subject: '🔐 Your GuardianSync Login OTP',
      text: `Your OTP for GuardianSync is: ${otpCode}. It expires in 5 minutes. Do not share this code with anyone.`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GuardianSync OTP</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0e1a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0e1a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color:#0d1229;border:1px solid #1e2a4a;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0d1229 0%,#0a1628 100%);border-bottom:1px solid #00f5ff33;padding:32px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0;font-size:11px;color:#00f5ff;letter-spacing:0.4em;text-transform:uppercase;">GuardianSync</p>
                    <h1 style="margin:8px 0 0;font-size:22px;font-weight:600;color:#e2e8f0;">Security Verification</h1>
                  </td>
                  <td align="right">
                    <div style="width:48px;height:48px;background:linear-gradient(135deg,#00f5ff22,#6366f122);border:1px solid #00f5ff44;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;">
                      <span style="font-size:22px;">🔐</span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;">A login attempt was made to your account.</p>
              <p style="margin:0 0 28px;font-size:13px;color:#94a3b8;">Use the code below to complete sign-in. This code expires in <strong style="color:#e2e8f0;">5 minutes</strong>.</p>

              <!-- OTP Box -->
              <div style="background:#070c1a;border:1px solid #00f5ff44;border-radius:10px;padding:28px;text-align:center;margin-bottom:28px;box-shadow:0 0 30px rgba(0,245,255,0.05);">
                <p style="margin:0 0 8px;font-size:11px;color:#00f5ff;letter-spacing:0.3em;text-transform:uppercase;">One-Time Password</p>
                <p style="margin:0;font-size:42px;font-weight:700;letter-spacing:0.25em;color:#ffffff;font-family:'Courier New',monospace;">${otpCode}</p>
              </div>

              <p style="margin:0 0 6px;font-size:12px;color:#64748b;">⚠️ If you didn't try to log in, please ignore this email and consider changing your password.</p>
              <p style="margin:0;font-size:12px;color:#64748b;">🛡️ Never share this code with anyone. GuardianSync will never ask for your OTP.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#080c1a;border-top:1px solid #1e2a4a;padding:20px 40px;">
              <p style="margin:0;font-size:11px;color:#334155;text-align:center;">This is an automated message from GuardianSync. Please do not reply to this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
    });

    console.log(`\n==========================================`);
    console.log(`✉️  Real OTP email sent to ${toEmail}`);
    console.log(`🔑 OTP Code: ${otpCode}`);
    console.log(`Message ID: ${info.messageId}`);
    console.log(`==========================================\n`);

    return true;
  } catch (error) {
    console.error('❌ Error sending OTP email:', error.message);
    return false;
  }
}

module.exports = {
  sendOtpEmail,
};
