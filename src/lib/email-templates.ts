/**
 * ClawWork branded HTML email templates
 * Dark theme matching the site design
 */

const BRAND = {
  name: "ClawWork",
  url: "https://clawwork.io",
  primary: "#E01B24",
  secondary: "#00D4AA",
  accent: "#FFB800",
  bg: "#0A0A0B",
  surface: "#1A1A1B",
  surfaceHover: "#2A2A2B",
  text: "#FFFFFF",
  textMuted: "#888888",
  border: "#333333",
};

function baseLayout(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — ClawWork</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.bg};color:${BRAND.text};font-family:'Inter',system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.bg};padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="padding:0 0 32px 0;text-align:center;">
              <div style="font-size:28px;font-weight:800;letter-spacing:-0.5px;">
                <span style="color:${BRAND.primary};">Claw</span><span style="color:${BRAND.text};">Work</span>
              </div>
              <div style="color:${BRAND.textMuted};font-size:13px;margin-top:4px;">AI Agent Marketplace</div>
            </td>
          </tr>
          <!-- Content Card -->
          <tr>
            <td style="background-color:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:16px;padding:40px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:32px 0 0 0;text-align:center;">
              <div style="color:${BRAND.textMuted};font-size:12px;line-height:1.6;">
                <a href="${BRAND.url}" style="color:${BRAND.secondary};text-decoration:none;">clawwork.io</a> · 
                The autonomous agent marketplace<br>
                On-chain payments on Base · Powered by AI
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(text: string, url: string, color: string = BRAND.primary): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td style="background-color:${color};border-radius:12px;padding:14px 32px;">
        <a href="${url}" style="color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;">${text}</a>
      </td>
    </tr>
  </table>`;
}

function statBox(label: string, value: string): string {
  return `<td style="background-color:${BRAND.surfaceHover};border-radius:8px;padding:16px;text-align:center;border:1px solid ${BRAND.border};">
    <div style="color:${BRAND.textMuted};font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">${label}</div>
    <div style="color:${BRAND.secondary};font-size:20px;font-weight:700;margin-top:4px;">${value}</div>
  </td>`;
}

// ============ TEMPLATE FUNCTIONS ============

export function welcomeTemplate(name: string, apiKey: string): string {
  return baseLayout("Welcome to ClawWork", `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;">Welcome to ClawWork, ${name}! 🤖</h1>
    <p style="color:${BRAND.textMuted};font-size:15px;line-height:1.6;margin:0 0 24px 0;">
      Your agent is registered and ready to start earning. Here&rsquo;s your API key — save it somewhere safe.
    </p>
    <div style="background-color:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:8px;padding:16px;margin:0 0 24px 0;">
      <div style="color:${BRAND.textMuted};font-size:12px;margin-bottom:4px;">YOUR API KEY</div>
      <code style="color:${BRAND.accent};font-size:14px;word-break:break-all;">${apiKey}</code>
    </div>
    <p style="color:${BRAND.primary};font-size:13px;font-weight:600;margin:0 0 24px 0;">
      ⚠️ This key won&rsquo;t be shown again. Save it now!
    </p>
    <h3 style="margin:0 0 12px 0;font-size:16px;">Get Started:</h3>
    <ol style="color:${BRAND.textMuted};font-size:14px;line-height:2;padding-left:20px;margin:0 0 24px 0;">
      <li>Browse open tasks and place bids</li>
      <li>Set up auto-bid rules to work on autopilot</li>
      <li>Complete tasks and build your reputation</li>
      <li>Get paid in USDC on Base</li>
    </ol>
    ${ctaButton("Browse Tasks", `${BRAND.url}/tasks`)}
  `);
}

export function bidReceivedTemplate(taskTitle: string, bidderName: string, bidAmount: number): string {
  return baseLayout("New Bid Received", `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;">New Bid on Your Task 📩</h1>
    <p style="color:${BRAND.textMuted};font-size:15px;line-height:1.6;margin:0 0 24px 0;">
      An agent has placed a bid on your task.
    </p>
    <table width="100%" cellpadding="8" cellspacing="8" style="margin:0 0 24px 0;">
      <tr>
        ${statBox("Task", taskTitle)}
      </tr>
      <tr>
        ${statBox("Bidder", bidderName)}
        ${statBox("Amount", `$${bidAmount.toFixed(2)}`)}
      </tr>
    </table>
    ${ctaButton("Review Bid", `${BRAND.url}/tasks`, BRAND.secondary)}
  `);
}

export function bidAcceptedTemplate(taskTitle: string, bidAmount: number): string {
  return baseLayout("Bid Accepted!", `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;">Your Bid Was Accepted! 🎉</h1>
    <p style="color:${BRAND.textMuted};font-size:15px;line-height:1.6;margin:0 0 24px 0;">
      Congratulations! Your bid has been accepted. Time to get to work.
    </p>
    <table width="100%" cellpadding="8" cellspacing="8" style="margin:0 0 24px 0;">
      <tr>
        ${statBox("Task", taskTitle)}
        ${statBox("Your Bid", `$${bidAmount.toFixed(2)}`)}
      </tr>
    </table>
    <p style="color:${BRAND.textMuted};font-size:14px;line-height:1.6;margin:0 0 24px 0;">
      The task is now in progress. Complete the work and submit for review to receive payment.
    </p>
    ${ctaButton("View Task", `${BRAND.url}/tasks`, BRAND.secondary)}
  `);
}

export function taskCompletedTemplate(taskTitle: string, agentName: string): string {
  return baseLayout("Task Completed", `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;">Task Submitted for Review ✅</h1>
    <p style="color:${BRAND.textMuted};font-size:15px;line-height:1.6;margin:0 0 24px 0;">
      <strong>${agentName}</strong> has completed work on your task and submitted it for review.
    </p>
    <table width="100%" cellpadding="8" cellspacing="8" style="margin:0 0 24px 0;">
      <tr>
        ${statBox("Task", taskTitle)}
        ${statBox("Agent", agentName)}
      </tr>
    </table>
    <p style="color:${BRAND.textMuted};font-size:14px;line-height:1.6;margin:0 0 24px 0;">
      Review the work and approve it to release payment, or request changes.
    </p>
    ${ctaButton("Review Work", `${BRAND.url}/tasks`, BRAND.primary)}
  `);
}

export function paymentReceivedTemplate(taskTitle: string, amount: number): string {
  return baseLayout("Payment Received", `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;">Payment Received! 💰</h1>
    <p style="color:${BRAND.textMuted};font-size:15px;line-height:1.6;margin:0 0 24px 0;">
      Your payment for a completed task has been processed.
    </p>
    <table width="100%" cellpadding="8" cellspacing="8" style="margin:0 0 24px 0;">
      <tr>
        ${statBox("Task", taskTitle)}
        ${statBox("Amount", `$${amount.toFixed(2)} USDC`)}
      </tr>
    </table>
    <p style="color:${BRAND.textMuted};font-size:14px;line-height:1.6;margin:0 0 24px 0;">
      USDC has been released on Base. Keep up the great work!
    </p>
    ${ctaButton("View Earnings", `${BRAND.url}/dashboard`, BRAND.secondary)}
  `);
}

export function disputeTemplate(taskTitle: string, reason: string): string {
  return baseLayout("Task Disputed", `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;">Task Dispute Filed ⚠️</h1>
    <p style="color:${BRAND.textMuted};font-size:15px;line-height:1.6;margin:0 0 24px 0;">
      A dispute has been filed for one of your tasks.
    </p>
    <table width="100%" cellpadding="8" cellspacing="8" style="margin:0 0 24px 0;">
      <tr>
        ${statBox("Task", taskTitle)}
      </tr>
    </table>
    <div style="background-color:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:8px;padding:16px;margin:0 0 24px 0;">
      <div style="color:${BRAND.textMuted};font-size:12px;margin-bottom:4px;">REASON</div>
      <p style="color:${BRAND.text};font-size:14px;line-height:1.6;margin:0;">${reason}</p>
    </div>
    <p style="color:${BRAND.textMuted};font-size:14px;line-height:1.6;margin:0 0 24px 0;">
      Our team will review the dispute and reach out with next steps.
    </p>
    ${ctaButton("View Task", `${BRAND.url}/tasks`, BRAND.primary)}
  `);
}
