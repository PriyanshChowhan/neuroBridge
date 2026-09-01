import { Worker } from "bullmq";
import client from "../config.js";
import { createBlockingRedisConnection } from "../config/redis.js";
import { setCallContext } from "../store/callStore.js";
import { AMBULANCE_QUEUE_NAME } from "./queueNames.js";

const JOB_ATTEMPTS = 3;
let ambulanceWorker;

function describeVitals(vitalsContext) {
  if (typeof vitalsContext === "string") {
    return vitalsContext;
  }
  return vitalsContext?.concernText || JSON.stringify(vitalsContext || {}) || "Not provided";
}

async function sendFallbackSms(job, callError) {
  const { patientName, patientAddress, vitalsContext } = job.data;
  const body = [
    "AUTOMATED AMBULANCE CALL FAILED — MANUAL FOLLOW-UP REQUIRED",
    `Patient: ${patientName || "Unknown"}`,
    `Address: ${patientAddress || "Not provided"}`,
    `Vitals: ${describeVitals(vitalsContext)}`
  ].join("\n");

  try {
    const sms = await client.messages.create({
      body,
      from: process.env.TWILIO_NUMBER,
      to: process.env.EMERGENCY_FALLBACK_NUMBER
    });
    console.error(`[CRITICAL] Ambulance call failed after all retries. Fallback SMS sent. SID: ${sms.sid}`);
  } catch (smsError) {
    console.error("[CRITICAL] Ambulance call and fallback SMS both failed:", {
      callError: callError.message,
      smsError: smsError.message,
      idempotencyKey: job.data.idempotencyKey
    });
  }
}

export async function processAmbulanceCallJob(job) {
  const {
    patientName,
    patientAddress,
    vitalsContext,
    emergencyDetails,
    ambulanceNumber
  } = job.data;

  let call;
  try {
    call = await client.calls.create({
      url: `${process.env.PUBLIC_URL}/ambulance-voice`,
      from: process.env.TWILIO_NUMBER,
      to: ambulanceNumber
    });
  } catch (error) {
    const attempts = job.opts.attempts || JOB_ATTEMPTS;
    if (job.attemptsMade + 1 >= attempts) {
      await sendFallbackSms(job, error);
    }
    throw error;
  }

  try {
    await setCallContext(call.sid, {
      patientName,
      patientAddress,
      vitalsContext,
      emergencyDetails
    });
  } catch (error) {
    // Twilio already accepted the call; throwing here would retry and risk duplicate dispatch calls.
    console.error(`[CRITICAL] Ambulance call ${call.sid} was created but its Redis context could not be stored:`, error);
  }

  console.log(`[Ambulance Worker] Emergency call initiated. SID: ${call.sid}`);
  return { callSid: call.sid };
}

export function startAmbulanceWorker() {
  if (ambulanceWorker) {
    return ambulanceWorker;
  }

  // BullMQ workers need a blocking duplicate; this reuses the configured Redis connection settings.
  const connection = createBlockingRedisConnection();
  ambulanceWorker = new Worker(AMBULANCE_QUEUE_NAME, processAmbulanceCallJob, { connection });
  ambulanceWorker.on("failed", (job, error) => {
    console.error(`[Ambulance Worker] Job ${job?.id || "unknown"} failed on attempt ${job?.attemptsMade || 0}: ${error.message}`);
  });
  ambulanceWorker.on("error", error => {
    console.error(`[Ambulance Worker] Worker error: ${error.message}`);
  });
  return ambulanceWorker;
}
