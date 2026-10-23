import * as authRepository from "../repository/auth.repository.js";
import * as userRepository from "../../user/repository/user.repository.js";
import { invalidCredentials, otpExpired, providerConflict, twoFactorAlreadyEnabled } from "../errors.js";
import { userAlreadyExist, userNotVerified, userNotExist } from "../../user/errors.js";
import { generateToken } from "../utils/token.js";
import { comparePassword, hashPassword } from "../utils/hash.js";
import { toValidName } from "../utils/name.js";
import { verifyGoogleToken } from "../../../lib/utils/google-auth.js";
import { revoke } from "../../../lib/auth/revocation.js";
import { mailer } from "../../../lib/email/mailer.js";
import { renderOtpEmail } from "../../../lib/email/templates.js";
import { otpService } from "./otp.service.js";
import { loginLock } from "./loginLock.js";
import { lockedError } from "./loginLock.core.js";

// deliver = false: the limits still apply but nothing is sent (used for emails that aren't registered)
async function issueOtp(email, purpose, deliver) {
    const code = await otpService.issue({ email, purpose });
    if (deliver) {
        // expiresInMinutes (default 3) matches the code lifetime in otp.core.js (180 seconds)
        const { subject, html } = renderOtpEmail({ purpose, code });
        // sent in the background: same response time for registered and unknown emails
        mailer.sendInBackground(email, subject, html);
    }
}


export async function register(userData){
    // 1. check user existence
    const userExist = await authRepository.checkUserExistByEmail(userData.email);
    // 2. if yes, throw an error.
    if(userExist) throw userAlreadyExist;
    // 3. prepared data [hash-password]
    userData.password = await hashPassword(userData.password);
    // 4. save user into DB -> isVerified: false
    const creatUser = await authRepository.createUser(userData);
    // 5. generate otp, save its hash and send it
    await issueOtp(userData.email, 'verify', true);
    return creatUser; 
}

export async function verifyAccount(email, code){
    // 1. check the code first (throws expired / invalid / too many attempts)
    await otpService.verify({ email, purpose: 'verify', code });
    // 2. codes are only issued to existing, unverified accounts, anything else looks like an expired code
    const user = await authRepository.checkUserExistByEmail(email);
    if (!user || user.isDeleted || user.isVerified) throw otpExpired;
    // 3. Switch your isVerified to true [update user]
    return await userRepository.updateUserByEmail(email, {isVerified: true});
}

// compare against a dummy hash when the user doesn't exist, so response time doesn't reveal it
let dummyHashPromise;
const getDummyHash = () => (dummyHashPromise ??= hashPassword('dummy-password-for-timing'));

// counts the failure; the 5th consecutive one bans the account for 5 minutes
async function loginFailure(email) {
    const banSeconds = await loginLock.recordFailure(email);
    return banSeconds ? lockedError(banSeconds) : invalidCredentials;
}

// returns { token } or, for accounts with two-step verification, { twoFactor: true } (a code was e-mailed)
export async function login(email, password){
    // 0. banned accounts are refused before anything else (also for the right password)
    await loginLock.assertNotLocked(email);
    // 1. password is excluded by default, so ask for it explicitly
    const user = await authRepository.findUserByEmailWithPassword(email) // {} | null
    // 2. missing / deleted / social account: same answer as a wrong password
    if (!user || user.isDeleted || !user.password) {
        await comparePassword(password, await getDummyHash());
        throw await loginFailure(email);
    }
    // 3. compare password
    const match = await comparePassword(password, user.password)
    if (!match) throw await loginFailure(email);
    // right password: consecutive failures start from zero again
    await loginLock.recordSuccess(email);
    // 4. verified check only AFTER the password is right (no enumeration through this branch)
    if (user.isVerified === false) throw userNotVerified;
    // 5. two-step verification: send a code instead of the token
    if (user.twoFactorEnabled === true) {
        await issueOtp(user.email, 'login2fa', true);
        return { twoFactor: true };
    }
    // 6. generate access Token 
    return { token: generateToken({id: user._id, name: user.name}) };
}

// second step of the login: the code that was e-mailed after the password check
export async function confirmLogin(email, code){
    await loginLock.assertNotLocked(email);
    await otpService.verify({ email, purpose: 'login2fa', code });
    const user = await authRepository.checkUserExistByEmail(email);
    if (!user || user.isDeleted || !user.isVerified || user.twoFactorEnabled !== true) throw otpExpired;
    return generateToken({id: user._id, name: user.name});
}

// logged-in user asks for the code that enables two-step verification
export async function requestEnableTwoFactor(userId){
    const user = await userRepository.findUserById(userId);
    if (!user) throw userNotExist;
    if (user.twoFactorEnabled === true) throw twoFactorAlreadyEnabled;
    await issueOtp(user.email, 'enable2fa', true);
}

export async function confirmEnableTwoFactor(userId, code){
    const user = await userRepository.findUserById(userId);
    if (!user) throw userNotExist;
    if (user.twoFactorEnabled === true) throw twoFactorAlreadyEnabled;
    await otpService.verify({ email: user.email, purpose: 'enable2fa', code });
    await userRepository.updateUserById(userId, { twoFactorEnabled: true });
}

export async function logout(user, all = false){
    if (all) {
        // every token issued before now is rejected by the guard
        await userRepository.updateUserById(user.id, { changeCredentialsTime: new Date() });
        return;
    }
    // only this device: block this token's jti until it expires
    // (tokens issued before phase 2 have no jti, for them the cookie clearing is all we can do)
    await revoke({ jti: user.jti, exp: user.exp });
}

export async function sendOtp(email){
    const user = await authRepository.checkUserExistByEmail(email);
    const exists = Boolean(user) && !user.isDeleted;
    // not verified yet -> verification code, verified -> password reset code
    const purpose = exists && user.isVerified ? 'reset' : 'verify';
    // same limits and same response for registered and unknown emails (no enumeration),
    // the email itself is only sent when the account exists
    await issueOtp(email, purpose, exists);
}


export async function resetPassword (email, code, newPassword){
    // 1. verify otp code (throws expired / invalid / too many attempts)
    await otpService.verify({ email, purpose: 'reset', code });
    // 2. reset codes are only issued to existing, verified accounts
    const user = await authRepository.checkUserExistByEmail(email);
    if (!user || user.isDeleted || !user.isVerified) throw otpExpired;
    // 3. hashpassword
    const hashedPassword = await hashPassword(newPassword);
    // 4. update password + invalidate every old session
    await userRepository.updateUserByEmail(email, {
        password: hashedPassword,
        changeCredentialsTime: new Date()
    })
}



export async function loginWithGoogle(idToken){
    // 1. verify idToken (also checks email_verified)
    const payload = await verifyGoogleToken(idToken);
    const email = payload.email.toLowerCase();
    // 2. check user exists
    const user = await authRepository.checkUserExistByEmail(email);
    // 3. if exists >> generate token
    if(user){
        if (user.isDeleted) throw invalidCredentials;
        // an email registered locally must not be taken over through Google
        if (user.provider !== 'google') throw providerConflict;
        return generateToken({ id: user._id, name: user.name });
    }
    // 4. if not exit create user >> generate Token
    const createdUser = await authRepository.createUser({
        name: toValidName(payload.name, email),
        email,
        provider: 'google',
        isVerified: true
    });
    return generateToken({ id: createdUser._id, name: createdUser.name });
}