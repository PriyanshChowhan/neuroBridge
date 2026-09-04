import mongoose from "mongoose";

const realtimeDataSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    heart_rate: { type: Number, required: true },
    spo2: { type: Number },
    stress_level: { type: Number },
    blood_pressure: {
        systolic: { type: Number },
        diastolic: { type: Number },
    },
    steps: { type: Number },
    calories_burned: { type: Number },
    timestamp: { type: Date, required: true },
}, {
    timestamps: true,
    collection: "realtime_data"   
});

realtimeDataSchema.index(
    { userId: 1, timestamp: -1 },
    { unique: true, partialFilterExpression: { userId: { $exists: true }, timestamp: { $exists: true } } }
);

// Default export
const RealtimeData = mongoose.model("RealtimeData", realtimeDataSchema);

export default RealtimeData;
