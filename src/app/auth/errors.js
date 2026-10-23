import { AppError } from "../../lib/error/error.js";

export const otpExpired = new AppError('OTP expired, please resend OTP', 404);
export const invalidCode = new AppError('invalid code', 400);
export const invalidPassword = new AppError('invalid password', 403);
// one message for wrong email / wrong password / deleted / social account (no user enumeration)
export const invalidCredentials = new AppError('invalid email or password', 401);
// email already belongs to an account created with another sign-in method
export const providerConflict = new AppError('this email is registered with a different sign-in method', 409);
export const twoFactorAlreadyEnabled = new AppError('two-step verification is already enabled', 409);