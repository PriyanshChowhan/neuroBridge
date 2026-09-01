import { Worker } from "bullmq";
import client from "../config.js";
import { createBlockingRedisConnection } from "../config/redis.js";
import { setCallContext, setCallResult, setFamilyConversation } from "../store/callStore.js";
import { FAMILY_QUEUE_NAME } from "./queueNames.js";

const JOB_ATTEMPTS = 3;
let familyWorker;

async function recordFinalFailure(job, error) {
  const { therapistCallSid } = job.data;
  console.error(`[CRITICAL] Family call failed after all retries for therapist call ${therapistCallSid}: ${error.message}`);

  try {
    await setCallResult(therapistCallSid, {
      familyCallFailed: true,
      familyCallFailureMessage: error.message,
      familyCallFailedAt: new Date().toISOString()
    });
  } catch (storeError) {
    console.error(`[CRITICAL] Failed to record family-call failure for ${therapistCallSid}: ${storeError.message}`);
  }
}

export async function processFamilyCallJob(job) {
  const {
    patientEmotionalState,
    familyNumber,
    therapistCallSid,
    therapistSummary
  } = job.data;

  let call;
  try {
    call = await client.calls.create({
      url: `${process.env.PUBLIC_URL}/family-voice`,
      from: process.env.TWILIO_NUMBER,
      to: familyNumber
    });
  } catch (error) {
    const attempts = job.opts.attempts || JOB_ATTEMPTS;
    if (job.attemptsMade + 1 >= attempts) {
      await recordFinalFailure(job, error);
    }
    throw error;
  }

  try {
    await Promise.all([
      setCallContext(call.sid, {
        patientEmotionalState,
        therapistSummary,
        originalCallSid: therapistCallSid
      }),
      setFamilyConversation(call.sid, {
        patientEmotionalState,
        conversation: [],
        therapistSummary,
        originalCallSid: therapistCallSid
      }),
      setCallResult(therapistCallSid, {
        familyCallFailed: false,
        familyCallSid: call.sid
      })
    ]);
  } catch (error) {
    // Twilio already accepted the call; throwing here would retry and notify the family twice.
    console.error(`[CRITICAL] Family call ${call.sid} was created but its Redis state could not be stored:`, error);
  }

  console.log(`[Family Worker] Family notification call initiated. SID: ${call.sid}`);
  return { callSid: call.sid };
}

export function startFamilyWorker() {
  if (familyWorker) {
    return familyWorker;
  }

  // BullMQ workers need a blocking duplicate; this reuses the configured Redis connection settings.
  const connection = createBlockingRedisConnection();
  familyWorker = new Worker(FAMILY_QUEUE_NAME, processFamilyCallJob, { connection });
  familyWorker.on("failed", (job, error) => {
    console.error(`[Family Worker] Job ${job?.id || "unknown"} failed on attempt ${job?.attemptsMade || 0}: ${error.message}`);
  });
  familyWorker.on("error", error => {
    console.error(`[Family Worker] Worker error: ${error.message}`);
  });
  return familyWorker;
}
