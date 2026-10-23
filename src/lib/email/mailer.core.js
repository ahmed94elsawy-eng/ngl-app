// "a***@x.com": logs are useful without storing full addresses
export function maskEmail(email) {
    const [name = '', domain = ''] = String(email).split('@');
    return `${name.slice(0, 1)}***@${domain}`;
}

// factory: `provider.sendMail(to, subject, html)` must reject on failure
export function createMailer({
    provider,
    logger,
    attempts = 2,
    retryDelayMs = 500,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
    // never throws: returns the provider answer, or null after the last failed attempt
    async function deliver(to, subject, html) {
        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                return await provider.sendMail(to, subject, html);
            } catch (err) {
                if (attempt === attempts) {
                    logger.error('email delivery failed', { to: maskEmail(to), subject, attempts, error: err.message });
                    return null;
                }
                logger.info('email delivery retry', { to: maskEmail(to), attempt, error: err.message });
                await sleep(retryDelayMs);
            }
        }
        return null;
    }

    // fire-and-forget: the HTTP response does not wait for Mailjet
    function sendInBackground(to, subject, html) {
        deliver(to, subject, html).catch((err) =>
            logger.error('email background task crashed', { error: err.message }));
    }

    return { deliver, sendInBackground };
}