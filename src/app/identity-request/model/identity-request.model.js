import { model, Schema } from "mongoose";

export const REQUEST_STATUSES = ['pending', 'accepted', 'rejected'];

const identityRequestSchema = new Schema(
    {
        message: { type: Schema.Types.ObjectId, ref: 'Message', required: true },
        // the receiver of the message, he asks "who sent this?"
        receiver: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        // the sender of the message, he decides
        sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        status: { type: String, enum: REQUEST_STATUSES, default: 'pending' },
        respondedAt: Date,
    },
    { timestamps: { createdAt: true, updatedAt: true } }
);

// one request per message
identityRequestSchema.index({ message: 1 }, { unique: true });
// "requests I received" (sender side)
identityRequestSchema.index({ sender: 1, status: 1, createdAt: -1 });
// "requests I sent" (receiver side)
identityRequestSchema.index({ receiver: 1, createdAt: -1 });

export const IdentityRequest = model('IdentityRequest', identityRequestSchema);