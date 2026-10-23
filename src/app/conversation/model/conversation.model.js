import { model, Schema } from "mongoose";

const conversationSchema = new Schema(
    {
        // the original anonymous message this conversation came from
        message: { type: Schema.Types.ObjectId, ref: 'Message', required: true },
        // exactly two users: [sender, receiver]
        participants: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
        lastMessageAt: { type: Date, default: Date.now },
    },
    { timestamps: { createdAt: true, updatedAt: true } }
);

// one conversation per message
conversationSchema.index({ message: 1 }, { unique: true });
// "my conversations", most recent first
conversationSchema.index({ participants: 1, lastMessageAt: -1 });

export const Conversation = model('Conversation', conversationSchema);