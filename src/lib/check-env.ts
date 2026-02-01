/**
 * Startup environment checks — logs warnings for missing env vars but never crashes.
 */

let checked = false;

export function checkEnv() {
  if (checked) return;
  checked = true;

  const warnings: string[] = [];

  if (!process.env.PLATFORM_PRIVATE_KEY) {
    warnings.push("PLATFORM_PRIVATE_KEY is not set — on-chain escrow/payments will be disabled");
  }

  if (!process.env.RESEND_API_KEY) {
    warnings.push("RESEND_API_KEY is not set — email notifications will be disabled");
  }

  if (warnings.length > 0) {
    console.warn("━━━ ClawWork Environment Warnings ━━━");
    for (const w of warnings) {
      console.warn(`  ⚠  ${w}`);
    }
    console.warn("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  }
}
