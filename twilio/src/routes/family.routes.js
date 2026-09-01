
import express from "express";
const router = express.Router();
import { GoogleGenerativeAI } from "@google/generative-ai";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
import { getFamilySystemPrompt} from "../utils/prompts.js"
import {
    appendToFamilyConversation,
    deleteCallContext,
    deleteFamilyConversation,
    getCallContext,
    getCallResult,
    getFamilyConversation,
    setFamilyConversation
} from "../store/callStore.js";
import { enqueueFamilyCall } from "../queues/callQueue.js";

async function cleanupFamilyCallState(callSid) {
    try {
        await Promise.all([
            deleteFamilyConversation(callSid),
            deleteCallContext(callSid)
        ]);
    } catch (error) {
        console.error(`[Family Call] Failed to clean up Redis state for ${callSid}:`, error);
    }
}

export async function initiatesFamilyCall(patientEmotionalState, familyNumber, therapistCallSid = null, therapistSummary = null) {
    if (!familyNumber) {
        console.log("[Family Call] No family number provided, skipping family notification");
        return;
    }

    if (!therapistCallSid) {
        throw new Error("therapistCallSid is required to enqueue a family call");
    }

    return enqueueFamilyCall({
        patientEmotionalState,
        familyNumber,
        therapistCallSid,
        therapistSummary,
        idempotencyKey: therapistCallSid
    });
}

router.post("/family-voice", async (req, res) => {
    const callSid = req.body.CallSid;
    console.log(`[Family Voice Webhook] Family call incoming. SID: ${callSid}`);

    const [context, storedFamilyConversation] = await Promise.all([
        getCallContext(callSid),
        getFamilyConversation(callSid)
    ]);
    let familyConversation = storedFamilyConversation;

    if (!familyConversation) {
        familyConversation = {
            patientEmotionalState: context?.patientEmotionalState || "SEVERELY_DEPRESSED",
            conversation: [],
            therapistSummary: context?.therapistSummary,
            originalCallSid: context?.originalCallSid
        };
        await setFamilyConversation(callSid, familyConversation);
    }

    const patientState = context?.patientEmotionalState || familyConversation.patientEmotionalState;
    let urgencyMessage = "";

    if (patientState === "SEVERELY_DEPRESSED") {
        urgencyMessage = "This is an urgent call regarding your family member's mental health status.";
    } else if (patientState === "MILDLY_DEPRESSED") {
        urgencyMessage = "I'm calling with some concerns about your family member's current wellbeing.";
    }

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
        <Say voice="Polly.Joanna">
            Hello, this is Dr. Anaya, a licensed therapist. ${urgencyMessage} I just completed a wellness check with your family member and need to discuss my findings with you.
        </Say>
        <Gather input="speech" timeout="15" speechTimeout="auto" language="en-US" action="/process-family-speech" method="POST">
            <Say voice="Polly.Joanna">Could you please tell me your relationship to the patient?</Say>
        </Gather>
        <Redirect>/family-voice-timeout</Redirect>
    </Response>`;

    res.type("text/xml").send(twiml);
});

router.post("/process-family-speech", express.urlencoded({ extended: false }), async (req, res) => {
    const speechResult = req.body.SpeechResult || "";
    const callSid = req.body.CallSid;

    console.log(`[Process Family Speech] Call: ${callSid}, Speech: "${speechResult}"`);

    if (!speechResult.trim()) {
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
            <Say voice="Polly.Joanna">I didn't catch that. Could you please tell me your relationship to the patient?</Say>
            <Gather input="speech" timeout="15" speechTimeout="auto" language="en-US" action="/process-family-speech" method="POST"></Gather>
            <Redirect>/family-voice-timeout</Redirect>
        </Response>`;
        return res.type("text/xml").send(twiml);
    }

    try {
        const [context, storedFamilyConversation] = await Promise.all([
            getCallContext(callSid),
            getFamilyConversation(callSid)
        ]);
        let familyConversation = storedFamilyConversation;

        if (!familyConversation) {
            familyConversation = {
                patientEmotionalState: context?.patientEmotionalState || "SEVERELY_DEPRESSED",
                conversation: [],
                therapistSummary: context?.therapistSummary,
                originalCallSid: context?.originalCallSid
            };
            await setFamilyConversation(callSid, familyConversation);
        }

        familyConversation = await appendToFamilyConversation(callSid, { role: "user", content: speechResult });
        const aiResponse = await getFamilyLLMResponse(
            familyConversation.conversation,
            callSid,
            context?.patientEmotionalState || familyConversation.patientEmotionalState
        );
        familyConversation = await appendToFamilyConversation(callSid, { role: "assistant", content: aiResponse });

        console.log(`[Process Family Speech] AI Response: "${aiResponse}"`);

        const conversationLength = familyConversation.conversation.length;

        if (conversationLength >= 8) {
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
            <Response>
                <Say voice="Polly.Joanna">${aiResponse}</Say>
                <Say voice="Polly.Joanna">Thank you for taking the time to speak with me. Please follow up with the recommendations we discussed, and don't hesitate to contact professional services if you need immediate assistance. Goodbye.</Say>
                <Hangup/>
            </Response>`;

            await cleanupFamilyCallState(callSid);
            return res.type("text/xml").send(twiml);
        }

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
            <Say voice="Polly.Joanna">${aiResponse}</Say>
            <Gather input="speech" timeout="15" speechTimeout="auto" language="en-US" action="/process-family-speech" method="POST"></Gather>
            <Redirect>/family-voice-timeout</Redirect>
        </Response>`;

        res.type("text/xml").send(twiml);

    } catch (error) {
        console.error(`[Process Family Speech] Error:`, error);
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
            <Say voice="Polly.Joanna">I'm having trouble processing that. Let me try again - what is your relationship to the patient?</Say>
            <Gather input="speech" timeout="15" speechTimeout="auto" language="en-US" action="/process-family-speech" method="POST"></Gather>
            <Redirect>/family-voice-timeout</Redirect>
        </Response>`;
        res.type("text/xml").send(twiml);
    }
});

router.post("/family-voice-timeout", async (req, res) => {
    const callSid = req.body.CallSid;
    console.log(`[Family Voice Timeout] Family member didn't respond. Call: ${callSid}`);

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
        <Say voice="Polly.Joanna">I haven't heard from you. This is regarding your family member's mental health status. Please call back when you're available to discuss this important matter.</Say>
        <Hangup/>
    </Response>`;

    await cleanupFamilyCallState(callSid);
    res.type("text/xml").send(twiml);
});


router.post("/family-call", async (req, res) => {
    const { therapistCallSid, familyNumber } = req.body;

    if (!therapistCallSid || !familyNumber) {
        return res.status(400).json({
            error: "Missing required parameters: therapistCallSid or familyNumber"
        });
    }

    try {
        // Wait for the emotion and summary to be ready
        const callResult = await getCallResult(therapistCallSid);

        if (!callResult || !callResult.completed) {
            return res.status(400).json({
                error: "Therapist call not completed yet or not found"
            });
        }

        const queueResult = await initiatesFamilyCall(
            callResult.emotion,
            familyNumber,
            therapistCallSid,
            callResult.summary
        );

        res.json({
            success: true,
            queued: queueResult.queued,
            jobId: queueResult.jobId,
            duplicateSuppressed: queueResult.duplicateSuppressed,
            familyCallSid: callResult.familyCallSid || null,
            therapistCallSid: therapistCallSid,
            emotion: callResult.emotion,
            summaryShared: true
        });
    } catch (error) {
        console.error("Error triggering family call:", error);
        res.status(500).json({
            error: "Failed to initiate family call",
            details: error.message
        });
    }
});

export async function endCall(callSid) {
    console.log(`[${callSid}] Ending call...`);
    await cleanupFamilyCallState(callSid);
    console.log(`[${callSid}] Call ended`);
}

export async function getFamilyLLMResponse(convo, callSid, patientEmotionalState) {
    console.log(`[${callSid}] Sending family notification prompt to LLM`);

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
        const [context, familyConversation] = await Promise.all([
            getCallContext(callSid),
            getFamilyConversation(callSid)
        ]);

        const therapistSummary = familyConversation?.therapistSummary || "No prior session summary available";
        
        const result = await model.generateContent([
            getFamilySystemPrompt(
                context?.patientName || "the patient",
                patientEmotionalState,
                context?.vitalsContext?.concernText,
                therapistSummary 
            ),
            ...convo.map(msg => msg.content).join('\n')
        ]);

        const reply = result.response.text();
        console.log(`[${callSid}] Family LLM replied: ${reply}`);
        return reply;
    } catch (error) {
        console.error(`[${callSid}] Family LLM Error:`, error);
        return "I'm calling to discuss your family member's wellness check. Could you please repeat what you just said?";
    }
}

export default router;
