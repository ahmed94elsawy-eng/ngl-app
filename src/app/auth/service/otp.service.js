import { cacheProvider } from "../../../lib/cache/init.js";
import { env } from "../../../lib/config/env.js";
import { generateOTPCode } from "../../../lib/utils/otp.js";
import { createOtpService } from "./otp.core.js";

export const otpService = createOtpService({
    cache: cacheProvider,
    secret: env.jwt.secret,
    generateCode: generateOTPCode,
});