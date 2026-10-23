import {z} from 'zod'

// exactly 6 digits (before: any 6 characters)
const code = z.string().trim().regex(/^\d{6}$/, { message: 'code must be 6 digits' });

export const registerDTO = z.object({
    email: z.email({message: "invalid email format"}).toLowerCase().trim(),
    name: z.string().trim().min(3).max(20), // same limits as the User model
    password: z.string().min(8).max(16).trim(),
    dob: z.coerce.date().optional(), // JSON has no Date type, the FE sends a string
    gender: z.enum(['male', 'female']).optional()
});


export const verifyAccountDTO = z.object({
    email: z.email().toLowerCase().trim(),
    code
});

export const loginDTO = z.object({
    email: z.email().toLowerCase().trim(),
    password: z.string().min(8).max(16).trim()
});

// second step of the login (only for accounts with two-step verification)
export const loginConfirmDTO = z.object({
    email: z.email().toLowerCase().trim(),
    code
});

export const twoFactorConfirmDTO = z.object({
    code
});


export const sendOTPDto = z.object({
    email: z.email().toLowerCase().trim()
});


export const resetPasswordDTO = z.object({
    email: z.email().toLowerCase().trim(),
    code,
    newPassword: z.string().min(8).max(16).trim()
});