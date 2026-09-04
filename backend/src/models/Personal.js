import mongoose, { Schema } from "mongoose";

const personalSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true
        },
        dob: { type: Date },
        gender: { type: String },
        address: { type: String },
        emergencyContact: { type: String },
        medicalHistory: { type: String },
        familyHistory: { type: String },
        lifestyle: { type: String },
        consentGiven: { type: Boolean, default: false }
    }, {
        timestamps: true,
        collection: 'personals'
    }
);

export const Personal = mongoose.model('Personal', personalSchema);

