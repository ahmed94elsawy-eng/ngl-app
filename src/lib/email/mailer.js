import { mailjetProvider } from "./init.js";
import { logger } from "../../pkg/logger/logger.js";
import { createMailer } from "./mailer.core.js";

export const mailer = createMailer({ provider: mailjetProvider, logger });