import nodemailer from 'nodemailer';
import { isIP } from 'node:net';

export type AccountEmailPurpose = 'verifyEmail' | 'resetPassword';

function smtpConfiguration() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM?.trim();
  const port = Number(process.env.SMTP_PORT || 0);
  const secureValue = process.env.SMTP_SECURE;
  const configuredOrigin = process.env.ACCOUNT_PUBLIC_URL?.trim();
  const tunnelOrigin = configuredOrigin === 'auto';
  let publicUrl: URL | null = null;
  if (!tunnelOrigin) {
    try {
      publicUrl = new URL(configuredOrigin || '');
    } catch {
      publicUrl = null;
    }
  }
  if (
    !host ||
    !user ||
    !password ||
    !from ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    (secureValue !== 'true' && secureValue !== 'false') ||
    (!tunnelOrigin &&
      (!publicUrl ||
        publicUrl.protocol !== 'https:' ||
        publicUrl.username ||
        publicUrl.password ||
        publicUrl.pathname !== '/' ||
        publicUrl.search ||
        publicUrl.hash))
  )
    return null;
  return {
    host,
    user,
    password,
    from,
    port,
    secure: secureValue === 'true',
    publicOrigin: publicUrl?.origin ?? null,
    tunnelOrigin,
  };
}

const configuration = smtpConfiguration();
export const emailDeliveryConfigured = Boolean(configuration);
const transporter = configuration
  ? nodemailer.createTransport({
      host: configuration.host,
      port: configuration.port,
      secure: configuration.secure,
      requireTLS: !configuration.secure,
      auth: { user: configuration.user, pass: configuration.password },
      tls: { minVersion: 'TLSv1.2' },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      pool: true,
      maxConnections: 2,
      maxMessages: 100,
    })
  : null;

export function buildAccountActionUrl(
  publicOrigin: string,
  purpose: AccountEmailPurpose,
  token: string,
) {
  const url = new URL(publicOrigin);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search
  )
    throw new Error('invalidEmailOrigin');
  const fragment = new URLSearchParams();
  fragment.set(purpose === 'verifyEmail' ? 'verifyEmail' : 'resetPassword', token);
  // URL fragments stay in the browser and are not sent to the web server or Referer headers.
  url.hash = fragment.toString();
  return url.toString();
}

function actionUrl(purpose: AccountEmailPurpose, token: string, requestOrigin?: string) {
  if (!configuration) throw new Error('emailDeliveryUnavailable');
  const publicOrigin = resolveAccountEmailOrigin({
    configuredOrigin: configuration.tunnelOrigin ? 'auto' : configuration.publicOrigin,
    requestOrigin,
  });
  if (!publicOrigin) throw new Error('emailOriginUnavailable');
  return buildAccountActionUrl(publicOrigin, purpose, token);
}

export function resolveAccountEmailOrigin(input: {
  configuredOrigin: string | null | undefined;
  requestOrigin?: string;
  trustedTunnelPeer?: boolean;
  cloudflareClientIp?: string;
}) {
  if (input.configuredOrigin && input.configuredOrigin !== 'auto') {
    try {
      const url = new URL(input.configuredOrigin);
      if (
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash
      )
        return url.origin;
    } catch {
      return null;
    }
    return null;
  }

  if (
    input.configuredOrigin !== 'auto' ||
    !input.trustedTunnelPeer ||
    !input.cloudflareClientIp ||
    isIP(input.cloudflareClientIp.trim()) === 0 ||
    !input.requestOrigin
  )
    return null;

  try {
    const url = new URL(input.requestOrigin);
    if (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash &&
      url.hostname.endsWith('.trycloudflare.com') &&
      url.port === ''
    )
      return url.origin;
  } catch {
    return null;
  }
  return null;
}

export async function sendAccountActionEmail(
  recipient: string,
  purpose: AccountEmailPurpose,
  token: string,
  requestOrigin?: string,
) {
  if (!transporter || !configuration) throw new Error('emailDeliveryUnavailable');
  const url = actionUrl(purpose, token, requestOrigin);
  const verify = purpose === 'verifyEmail';
  const subject = verify ? 'Verify your Kitchen Rush account' : 'Reset your Kitchen Rush password';
  const action = verify ? 'verify your email address' : 'reset your password';
  await transporter.sendMail({
    from: configuration.from,
    to: recipient,
    subject,
    text: `Use this secure link to ${action}: ${url}\n\nThis link expires in 30 minutes. If you did not request it, you can ignore this email.`,
    html: `<p>Use this secure link to ${action}:</p><p><a href="${url}">${verify ? 'Verify email' : 'Reset password'}</a></p><p>This link expires in 30 minutes. If you did not request it, you can ignore this email.</p>`,
  });
}

export async function verifyEmailTransport() {
  if (!transporter) throw new Error('emailDeliveryUnavailable');
  await transporter.verify();
}

export function emailPublicOrigin() {
  return configuration?.publicOrigin ?? null;
}

export function emailUsesAutomaticTunnelOrigin() {
  return configuration?.tunnelOrigin ?? false;
}
