import dotenv from "dotenv";
dotenv.config();
import express from "express";
import MONGODB from "./db/index.js";
import cookieParser from "cookie-parser";

import dailyRoutes from "./routes/daily.routes.js";
import realtimeRoutes from "./routes/realtime.routes.js";
import personalRoutes from "./routes/personal.routers.js";
import healthRoutes from "./routes/health.routes.js";

import userRoutes from "./routes/user.routers.js";

import cors from "cors";

const app = express();
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:8080")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

app.set("trust proxy", 1);
app.use(cors({
    credentials: true,
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("Origin not allowed by CORS"));
    },
}));
app.use(express.json());
app.use(cookieParser());

// API Routes
app.use("/api/daily", dailyRoutes);
app.use("/api/realtime", realtimeRoutes);
app.use("/api/personal", personalRoutes);
app.use("/api/user", userRoutes);
app.use("/api", healthRoutes);

// Home Route
app.get("/", (req, res) => {
    res.send("API working!");
});

const PORT = process.env.PORT || 5000;

const requiredEnvironment = [
    "MONGO_URI",
    "ACCESS_TOKEN_SECRET_KEY",
    "ACCESS_TOKEN_EXPIRY_DATE",
    "REFRESH_TOKEN_SECRET_KEY",
    "REFRESH_TOKEN_EXPIRY_DATE",
];

const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);
if (missingEnvironment.length) {
    console.error(`Missing required environment variables: ${missingEnvironment.join(", ")}`);
    process.exit(1);
}

async function start() {
    try {
        await MONGODB();
        app.listen(PORT, () => console.log(` Server running on port ${PORT}`));
    } catch (error) {
        console.error("Backend startup failed:", error.message);
        process.exit(1);
    }
}

start();
