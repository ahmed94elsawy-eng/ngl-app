import {model, Schema } from "mongoose";
import { CONTENT_MIN, CONTENT_MAX } from "../message.constants.js";

// schema 
const messageSchema = new Schema(
    {
        content: {
            type: String,
            required: true,
            trim: true,
            minlength: CONTENT_MIN,
            maxlength: CONTENT_MAX
        },
        receiver: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        sender: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            select: false // internal only (moderation): query with .select('+sender')
        },
        isDeleted: {
            type: Boolean,
            default: false
        },

    },
    
    {
       timestamps: {
           createdAt: true,
           updatedAt: true
       },
    }
)

// the inbox query: filter by receiver + isDeleted, newest first
messageSchema.index({ receiver: 1, isDeleted: 1, createdAt: -1, _id: -1 });

// model

export const Message = model("Message", messageSchema);