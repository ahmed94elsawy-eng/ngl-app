
import Mailjet from 'node-mailjet'
import { AppError } from '../../lib/error/error.js';
import { logger } from '../logger/logger.js';


export class MailjetProvider {
    client;
    fromEmail;
    fromName;

    constructor(config) {
        this.client = new Mailjet(
            {
                apiKey: config.apiKey,
                apiSecret: config.apiSecret 
            });
            this.fromEmail = config.fromEmail;
            this.fromName = config.fromName
    }

    async sendMail(email, subject, html){
        try {
            return await this.client.post('send', { version: 'v3.1' }).request({
                Messages: [
                    {
                        From: { Email: this.fromEmail, Name: this.fromName },
                        To: [{ Email: email }],
                        Subject: subject,
                        HTMLPart: html
                    },
                ],
            });
        } catch (err) {
            logger.error('mailjet send failed', { error: err?.message });
            throw new AppError('failed to send email', 502);
        }
    }

}