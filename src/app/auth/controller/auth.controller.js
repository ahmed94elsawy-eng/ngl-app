import { validateBody } from "../../../lib/validation/validation.js";
import { registerDTO, loginDTO, loginConfirmDTO, twoFactorConfirmDTO, sendOTPDto, verifyAccountDTO, resetPasswordDTO} from "../dto/auth.dto.js";
import * as authService from "../service/auth.service.js";
import { accessCookieOptions, clearCookieOptions } from "../utils/cookie.js";

export async function register(req, res, next){
    try{
        const data = validateBody(registerDTO, req.body);
        const createdUser = await authService.register(data);
        res.status(201).json({
            message: 'User Created Successfully',
            success: true,
            data: createdUser
        });
    }catch(error){
      next(error);
    }
}

export async function verifiyAccount(req, res, next){
    try{
    const data = validateBody(verifyAccountDTO, req.body)
    const {email, code} = data;
    const updatedUser = await authService.verifyAccount(email, code);
    res.json({
        message: 'User Verified Successfully',
        success: true,
        data: updatedUser
    });
    }catch (error) {
        next(error);
    }
}


export async function login(req, res, next){
    try{  
          const data = validateBody(loginDTO, req.body)
          const {email, password} = data;
          const result = await authService.login(email, password);

          // two-step verification enabled: no cookie yet, the code was sent by e-mail
          if (result.twoFactor) {
              return res.json({
                  message: 'verification code sent to your email, confirm it to finish login',
                  success: true,
                  data: { twoFactorRequired: true }
              });
          }

          res.cookie('access_token', result.token, accessCookieOptions());
          res.json({
            message: 'User Login Successfully',
            success: true
          });
    }catch (error){
        next(error)
    }
}


export async function confirmLogin(req, res, next){
    try{
        const { email, code } = validateBody(loginConfirmDTO, req.body);
        const token = await authService.confirmLogin(email, code);
        res.cookie('access_token', token, accessCookieOptions());
        res.json({ message: 'User Login Successfully', success: true });
    }catch(error){
        next(error)
    }
}


export async function requestEnableTwoFactor(req, res, next){
    try{
        await authService.requestEnableTwoFactor(req.user.id);
        res.json({ message: 'verification code sent to your email', success: true });
    }catch(error){
        next(error)
    }
}


export async function confirmEnableTwoFactor(req, res, next){
    try{
        const { code } = validateBody(twoFactorConfirmDTO, req.body);
        await authService.confirmEnableTwoFactor(req.user.id, code);
        res.json({ message: 'two-step verification enabled', success: true });
    }catch(error){
        next(error)
    }
}


export async function logout(req, res, next){
    try{
        // body is optional: { "all": true } logs out from every device
        const all = req.body?.all === true;
        await authService.logout(req.user, all);
        res.clearCookie('access_token', clearCookieOptions());
        res.json({ message: 'logged out successfully', success: true });
    }catch(error){
        next(error)
    }
}


export async function sendOtp(req, res, next){
    try{ 
         const data = validateBody(sendOTPDto, req.body)
         const {email} = data;
         await authService.sendOtp(email);
         res.json({message: "if this email is registered, a new code was sent", success: true});
    }catch (error){
        next(error);
    }
}


export async function resetPassword(req, res, next){
    try{
       const data = validateBody(resetPasswordDTO, req.body)
       const {email, code, newPassword} = data;
       await authService.resetPassword(email, code, newPassword);
       res.status(200).json({
        message: "password reset successfully",
        success: true
    });
    }catch(error){
        next(error)
    }
}


export async function loginWithGoogle(req, res, next){
    try{
        const token = await authService.loginWithGoogle(req.body?.idToken);
        res.cookie('access_token', token, accessCookieOptions());
        res.json({message: "user login successfully", success: true})
    }catch(error){
        next(error)
    }
}