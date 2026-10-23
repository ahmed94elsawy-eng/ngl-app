// brand settings in one place
const BRAND = { name: 'NGL', color: '#680d2d' };

const escapeHtml = (value) =>
    String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// one template, the purpose only changes the texts
const PURPOSES = {
    verify: {
        subject: `${BRAND.name} verification code`,
        title: 'Verify your email',
        intro: `Use the code below to verify your ${BRAND.name} account.`,
    },
    reset: {
        subject: `${BRAND.name} password reset code`,
        title: 'Reset your password',
        intro: `Use the code below to reset your ${BRAND.name} password.`,
    },
    enable2fa: {
        subject: `${BRAND.name} two-step verification code`,
        title: 'Enable two-step verification',
        intro: `Use the code below to turn on two-step verification for your ${BRAND.name} account.`,
    },
    login2fa: {
        subject: `${BRAND.name} login code`,
        title: 'Confirm your login',
        intro: `Use the code below to finish signing in to ${BRAND.name}.`,
    },
};

// pure function: returns { subject, html }. No external images or links (nothing to track or break).
export function renderOtpEmail({ purpose, code, expiresInMinutes = 3 }) {
    const p = PURPOSES[purpose];
    if (!p) throw new Error(`invalid email purpose: ${purpose}`);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(p.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f3f3;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:24px 10px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" border="0"
          style="width:100%;max-width:560px;background-color:#ffffff;border:1px solid #dddddd;">
          <tr>
            <td align="center" style="background-color:${BRAND.color};padding:22px;color:#ffffff;font-size:28px;font-weight:bold;letter-spacing:2px;">
              ${escapeHtml(BRAND.name)}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:32px 24px 8px;">
              <h1 style="margin:0;color:${BRAND.color};font-size:24px;">${escapeHtml(p.title)}</h1>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 24px 20px;color:#333333;font-size:15px;line-height:22px;">
              ${escapeHtml(p.intro)}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 24px 24px;">
              <div style="background-color:${BRAND.color};color:#ffffff;padding:14px 10px;font-size:28px;letter-spacing:8px;border-radius:6px;font-weight:bold;">
                ${escapeHtml(code)}
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 24px 28px;color:#777777;font-size:12px;line-height:18px;">
              This code expires in ${escapeHtml(expiresInMinutes)} minutes.<br />
              If you didn't request it, you can safely ignore this email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    return { subject: p.subject, html };
}