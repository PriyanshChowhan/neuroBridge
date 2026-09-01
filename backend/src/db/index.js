import mongoose from "mongoose";
import dotenv from "dotenv"
dotenv.config();
const MONGO_URI = process.env.MONGO_URI;

// EXPORT DEFAULT FUNCTION
const MONGODB = async () => {
    if (!MONGO_URI) {
        throw new Error("Missing required environment variable: MONGO_URI");
    }
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log(" Connected to MongoDB");
};

export default MONGODB;
