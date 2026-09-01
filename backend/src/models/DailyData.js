import mongoose from "mongoose";

const dailyDataSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    sleep: {
        duration: { type: Number, required: true },
        quality: { type: String, enum: ["good", "average", "poor"], required: true },
        start: { type: Date, required: true },
        end: { type: Date, required: true }
    },
    nutrition: {
        calories: { type: Number, required: true },
        protein: { type: Number, required: true },
        carbs: { type: Number, required: true },
        fat: { type: Number, required: true }
    },
    water_intake: { type: Number, required: true },
    energy_score: { type: Number, required: true },
    timestamp: { type: Date, required: true },
}, { collection: "daily_data", timestamps: true });

dailyDataSchema.index(
    { userId: 1, timestamp: -1 },
    { unique: true, partialFilterExpression: { userId: { $exists: true }, timestamp: { $exists: true } } }
);

export default mongoose.model("DailyData", dailyDataSchema);
