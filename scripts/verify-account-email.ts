import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const configPath = resolve(process.cwd(), '.env.account.local');
try {
  const content = await readFile(configPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator);
    if (
      [
        'SMTP_HOST',
        'SMTP_PORT',
        'SMTP_SECURE',
        'SMTP_USER',
        'SMTP_PASS',
        'SMTP_FROM',
        'ACCOUNT_PUBLIC_URL',
      ].includes(key)
    )
      process.env[key] = line.slice(separator + 1);
  }
} catch {
  console.error('Local SMTP config was not found. Run scripts/configure-account-email.ps1 first.');
  process.exitCode = 1;
}

if (!process.exitCode) {
  const email = await import('../apps/server/src/persistence/email');
  if (!email.emailDeliveryConfigured) {
    console.error(
      'SMTP settings are incomplete or the email origin setting is invalid. No values were displayed.',
    );
    process.exitCode = 1;
  } else {
    try {
      await email.verifyEmailTransport();
      console.log(
        'SMTP connection, TLS, and authentication check passed. Sender delivery was not tested.',
      );
    } catch (error) {
      const code = (error as { code?: unknown })?.code;
      console.error(
        'SMTP connection check failed.',
        typeof code === 'string' ? `Code: ${code}` : 'Check local settings and provider logs.',
      );
      process.exitCode = 1;
    }
  }
}
