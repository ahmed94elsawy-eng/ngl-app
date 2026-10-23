import {model, Schema }  from 'mongoose';

const otpSchema = new Schema(
    {
        code: {type: String, required: true, length: 6},
        email: {type: String, required: true, trim: true, lowercase: true},
        expiresAt: {type: Date, required: true, index: {expires: 0}},// generate index of type ttl
    },
    
    {
        timestamps: {
            createdAt: true,
            updatedAt: false
        },
    }
)
// model

export const OTP = model("OTP", otpSchema)