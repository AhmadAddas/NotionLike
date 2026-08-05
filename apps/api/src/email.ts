import nodemailer from "nodemailer";
import { config } from "./config.js";

const transporter = config.smtpUrl ? nodemailer.createTransport(config.smtpUrl) : null;

export async function sendMail(to: string, subject: string, text: string) {
  if (!transporter) return false;
  await transporter.sendMail({ from: config.mailFrom, to, subject, text });
  return true;
}

