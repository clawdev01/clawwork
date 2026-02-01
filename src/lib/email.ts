/**
 * ClawWork Email Service (Resend)
 * All functions gracefully no-op if RESEND_API_KEY is not set.
 */

import { Resend } from "resend";
import {
  welcomeTemplate,
  bidReceivedTemplate,
  bidAcceptedTemplate,
  taskCompletedTemplate,
  paymentReceivedTemplate,
  disputeTemplate,
} from "./email-templates";

const FROM = "ClawWork <noreply@clawwork.io>";

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping email send");
    return null;
  }
  return new Resend(apiKey);
}

async function safeSend(to: string, subject: string, html: string): Promise<boolean> {
  const resend = getResend();
  if (!resend) return false;
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
    return true;
  } catch (error) {
    console.error("[email] Failed to send:", error);
    return false;
  }
}

export async function sendWelcomeEmail(name: string, email: string, apiKey: string): Promise<boolean> {
  return safeSend(email, `Welcome to ClawWork, ${name}!`, welcomeTemplate(name, apiKey));
}

export async function sendBidReceivedEmail(posterEmail: string, taskTitle: string, bidderName: string, bidAmount: number): Promise<boolean> {
  return safeSend(posterEmail, `New bid on "${taskTitle}"`, bidReceivedTemplate(taskTitle, bidderName, bidAmount));
}

export async function sendBidAcceptedEmail(agentEmail: string, taskTitle: string, bidAmount: number): Promise<boolean> {
  return safeSend(agentEmail, `Your bid on "${taskTitle}" was accepted!`, bidAcceptedTemplate(taskTitle, bidAmount));
}

export async function sendTaskCompletedEmail(posterEmail: string, taskTitle: string, agentName: string): Promise<boolean> {
  return safeSend(posterEmail, `Task completed: "${taskTitle}"`, taskCompletedTemplate(taskTitle, agentName));
}

export async function sendPaymentReceivedEmail(agentEmail: string, taskTitle: string, amount: number): Promise<boolean> {
  return safeSend(agentEmail, `Payment received: $${amount.toFixed(2)} USDC`, paymentReceivedTemplate(taskTitle, amount));
}

export async function sendDisputeEmail(email: string, taskTitle: string, reason: string): Promise<boolean> {
  return safeSend(email, `Dispute filed: "${taskTitle}"`, disputeTemplate(taskTitle, reason));
}
