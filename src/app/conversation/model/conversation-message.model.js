import { model, Schema } from "mongoose";
import { CONVERSATION_CONTENT_MIN, CONVERSATION_CONTENT_MAX } from "../conversation.constants.js";

const conversationMessageSchema = new Schema(
    {
        conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
        author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        content: {
            type: String,
            required: true,
            trim: true,
            minlength: CONVERSATION_CONTENT_MIN,
            maxlength: CONVERSATION_CONTENT_MAX
        },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

conversationMessageSchema.index({ conversation: 1, createdAt: -1, _id: -1 });

export const ConversationMessage = model('ConversationMessage', conversationMessageSchema);