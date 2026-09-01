import express from "express";
const app = express();
import { GoogleGenerativeAI } from "@google/generative-ai";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
import {getAmbulanceSystemPrompt} from "../utils/prompts.js"
import { deleteCallContext, getCallContext } from "../store/callStore.js";
import { createAmbulanceIdempotencyKey, enqueueAmbulanceCall } from "../queues/callQueue.js";

export async function initiateAmbulanceCall(patientName, patientAddress, vitalsContext, emergencyDetails, ambulanceNumber, alertIdentifier = null) {
    if (!ambulanceNumber) {
        console.log("[Ambulance Call] No ambulance number provided, skipping ambulance call");
        return;
    }

    const idempotencyKey = createAmbulanceIdempotencyKey(
        patientName,
        patientAddress,
        alertIdentifier
    );

    return enqueueAmbulanceCall({
        patientName,
        patientAddress,
        vitalsContext,
        emergencyDetails,
        ambulanceNumber,
        idempotencyKey
    });
}

app.post("/ambulance-voice", async (req, res) => {
    const callSid = req.body.CallSid;
    console.log(`[Ambulance Voice Webhook] Emergency call incoming. SID: ${callSid}`);
    
    try {
        const context = await getCallContext(callSid);
        const emergencyMessage = await getAmbulanceLLMResponse(
            context?.patientName || "Patient",
            context?.patientAddress || process.env.PATIENT_ADDRESS || "Address not provided",
            context?.vitalsContext?.concernText || "critical vital signs detected",
            context?.emergencyDetails || "Patient monitoring system detected critical health emergency requiring immediate response"
        );

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
            <Say voice="Polly.Joanna">
                ${emergencyMessage}
            </Say>
            <Pause length="2"/>
            <Say voice="Polly.Joanna">
                Please confirm ambulance dispatch to this address. This is an automated emergency call from a patient monitoring system. Thank you.
            </Say>
            <Hangup/>
        </Response>`;

        console.log(`[Ambulance Voice Webhook] Emergency message delivered for call ${callSid}`);
        res.type("text/xml").send(twiml);
    } catch (error) {
        console.error(`[Ambulance Voice Webhook] Error:`, error);

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
            <Say voice="Polly.Joanna">
                This is Dr. Sarah calling for emergency medical services. We have a patient with critical vital signs requiring immediate ambulance dispatch. Patient monitoring system detected a medical emergency. Please send ambulance to the registered address immediately.
            </Say>
            <Hangup/>
        </Response>`;

        res.type("text/xml").send(twiml);
    } finally {
        try {
            await deleteCallContext(callSid);
        } catch (error) {
            console.error(`[Ambulance Voice Webhook] Failed to clean up context for ${callSid}:`, error);
        }
    }
});

app.get("/ambulance-call", async (req, res) => {
    const { ambulanceNumber, patientName, patientAddress, emergencyDetails, alertId, triggerId } = req.query;

    if (!ambulanceNumber) {
        return res.status(400).json({
            error: "Missing ambulanceNumber parameter"
        });
    }

    const testPatientName = patientName || "Patient";
    const testPatientAddress = patientAddress || "123 Emergency Street, Test City";
    const testEmergencyDetails = emergencyDetails || "Patient monitoring system detected critical vital signs requiring immediate medical attention";
    const testVitalsContext = { concernText: "critical heart rate of 180 BPM and oxygen saturation below 85%" };

    try {
        const queueResult = await initiateAmbulanceCall(
            testPatientName,
            testPatientAddress,
            testVitalsContext,
            testEmergencyDetails,
            ambulanceNumber,
            alertId || triggerId || null
        );

        res.json({
            success: true,
            ambulanceNumber: ambulanceNumber,
            queued: queueResult.queued,
            jobId: queueResult.jobId,
            duplicateSuppressed: queueResult.duplicateSuppressed
        });
    } catch (error) {
        console.error("Ambulance Call Error:", error);
        res.status(500).json({
            error: "Failed to initiate ambulance test call",
            details: error.message
        });
    }
});


export async function getAmbulanceLLMResponse(patientName, patientAddress, vitalsContext, emergencyDetails) {
    console.log(`[Ambulance Call] Generating emergency dispatch message`);

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
        const result = await model.generateContent([
            getAmbulanceSystemPrompt(patientName, patientAddress, vitalsContext, emergencyDetails)
        ]);

        const reply = result.response.text();
        console.log(`[Ambulance Call] Emergency message generated: ${reply}`);
        return reply;
    } catch (error) {
        console.error(`[Ambulance Call] LLM Error:`, error);
        return `This is Dr. Sarah calling for emergency medical services. We have a patient at ${patientAddress || 'unknown address'} with critical vital signs requiring immediate ambulance dispatch. Patient name: ${patientName || 'Unknown'}. Critical condition detected by patient monitoring system.`;
    }
}
export default app;
