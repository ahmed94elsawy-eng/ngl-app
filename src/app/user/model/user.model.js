import {model, Schema } from "mongoose";

const userSchema = new Schema(
    {
        name: {
            type: String,
            required: true,
            minlength: 3,
            maxlength: 20,
            trim: true
        },
        email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true
        },
        password: {
            type: String,
            select: false, // never returned by queries unless '+password' is requested
            required: function(){
                return this.provider === 'local'; //true in case of local provider other wise false
            }
        },
        provider: {
            type: String,
            enum: ['local', 'google', 'facebook'],
            default: 'local'
        },
        isDeleted: {
            type: Boolean,
            default: false
        },
        isVerified: {
            type: Boolean,
            default: false //update to true after email verification
        },
        twoFactorEnabled: {
            type: Boolean,
            default: false // existing users have no value, which counts as disabled
        },
        // tokens issued before this date are rejected (password reset / logout from all devices)
        changeCredentialsTime: Date,
        dob: Date,//optional
        gender: {
            type: String,
            enum: ['male', 'female'],
            default: 'male'//update to female after email verification
        },
        profilePicPath: String,
        coverImagePaths: [String], // was a single String, but the endpoint never saved anything, so no data to migrate
        cvPath: String


    },

    {
       timestamps: {
        createdAt: true,
        updatedAt: true
       },
       toJSON: {
        // User.create() returns the password hash on the document, so strip it on serialization too
        transform: (_doc, ret) => {
            delete ret.password;
            return ret;
        }
       }
    }
)

// model

export const User = model('User', userSchema)