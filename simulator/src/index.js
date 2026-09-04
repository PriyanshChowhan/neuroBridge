import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import { realtimeDataInterval, dailyDataInterval } from "./constants.js";
import dotenv from "dotenv";

dotenv.config()

const patientUserId = process.env.PATIENT_USER_ID?.trim();

if (!patientUserId) {
    console.error("Missing required environment variable: PATIENT_USER_ID");
    process.exit(1);
}

const app = express();

app.use(
    cors({
        origin: "*",
        credentials: true,
    })
);

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
});

app.use(express.json());

let overrideData = null;

// --- Incremental counters ---
let stepCount = 0;
let calorieCount = 0;

// Utility
function random(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateBloodPressure() {
    return {
        systolic: random(105, 130),
        diastolic: random(65, 85),
    };
}

// ---- REALTIME DATA ----
function generateRealtimeData() {
    if (overrideData) {
        return {
            ...overrideData,
            userId: patientUserId,
            steps: stepCount,
            calories_burned: calorieCount,
            timestamp: Date.now(),
        };
    }

    stepCount += random(5, 20);
    calorieCount += random(1, 5);

    return {
        userId: patientUserId,
        heart_rate: random(60, 100),
        spo2: random(95, 100),
        stress_level: random(1, 5),
        blood_pressure: generateBloodPressure(),
        steps: stepCount,
        calories_burned: calorieCount,
        timestamp: Date.now(),
    };
}
// ---- DAILY DATA ----
function generateDailyData() {
    return {
        userId: patientUserId,
        sleep: {
            duration: random(300, 500),
            quality: ["good", "average", "poor"][random(0, 2)],
            start: Date.now() - 8 * 60 * 60 * 1000,
            end: Date.now(),
        },
        nutrition: {
            calories: random(1500, 2500),
            protein: random(40, 100),
            carbs: random(150, 300),
            fat: random(40, 90),
        },
        water_intake: (Math.random() * 3).toFixed(1),
        energy_score: random(50, 95),
        timestamp: Date.now(),
    };
}

let latestRealtimeData = null;
let latestDailyData = null;

setInterval(() => {
    latestRealtimeData = generateRealtimeData();
    io.emit("realtimeData", latestRealtimeData);
}, realtimeDataInterval);

setInterval(() => {
    latestDailyData = generateDailyData();
    io.emit("dailyData", latestDailyData);
}, dailyDataInterval);

// WebSocket (Socket.IO) connection
io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // Send the most recent reading immediately so a late-joining client
    // (e.g. the agent restarting) doesn't wait up to a full interval before
    // seeing any data.
    if (latestRealtimeData) socket.emit("realtimeData", latestRealtimeData);
    if (latestDailyData) socket.emit("dailyData", latestDailyData);

    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
    });
});

// Override API
app.post("/override", (req, res) => {
    const { heart_rate, spo2, stress_level, blood_pressure } = req.body;

    overrideData = {
        heart_rate: heart_rate ?? random(60, 100),
        spo2: spo2 ?? random(95, 100),
        stress_level: stress_level ?? random(1, 5),
        blood_pressure: blood_pressure ?? generateBloodPressure(),
    };

    const emittedOverride = generateRealtimeData();

    io.emit("overrideSet", emittedOverride);
    res.json({ status: "override set", data: emittedOverride });
});

// Reset API
app.post("/reset", (req, res) => {
    overrideData = null;
    io.emit("overrideCleared");
    res.json({ status: "override cleared" });
});

// Start server
const port = process.env.PORT || 4000;
server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
