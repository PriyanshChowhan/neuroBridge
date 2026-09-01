import { createHash } from "node:crypto";
import { Queue } from "bullmq";
import redis from "../config/redis.js";
import { AMBULANCE_QUEUE_NAME, FAMILY_QUEUE_NAME } from "./queueNames.js";

export { AMBULANCE_QUEUE_NAME, FAMILY_QUEUE_NAME } from "./queueNames.js";

const DEDUP_TTL_SECONDS = 10 * 60;
const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 2_000
  }
};

export const ambulanceCallQueue = new Queue(AMBULANCE_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions
});

export const familyCallQueue = new Queue(FAMILY_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions
});

ambulanceCallQueue.on("error", error => {
  console.error(`[Ambulance Queue] Redis error: ${error.message}`);
});

familyCallQueue.on("error", error => {
  console.error(`[Family Queue] Redis error: ${error.message}`);
});

export function createAmbulanceIdempotencyKey(patientName, patientAddress, alertIdentifier = null, timestamp = Date.now()) {
  if (alertIdentifier) {
    return String(alertIdentifier);
  }

  const roundedTimestamp = Math.round(timestamp / 60_000) * 60_000;
  return createHash("sha256")
    .update(`${patientName || ""}${patientAddress || ""}${roundedTimestamp}`)
    .digest("hex");
}

async function enqueueWithDedup(queue, jobName, data) {
  const dedupKey = `dedup:${data.idempotencyKey}`;
  const reserved = await redis.set(
    dedupKey,
    JSON.stringify({ jobId: null, queuedAt: new Date().toISOString() }),
    "EX",
    DEDUP_TTL_SECONDS,
    "NX"
  );

  if (!reserved) {
    const existingValue = await redis.get(dedupKey);
    let existingJobId = null;
    try {
      existingJobId = existingValue ? JSON.parse(existingValue).jobId : null;
    } catch {
      // A malformed dedup value still means the event has already been reserved.
    }
    console.log(`[Call Queue] Duplicate ${jobName} suppressed for idempotency key ${data.idempotencyKey}`);
    return { queued: false, duplicateSuppressed: true, jobId: existingJobId };
  }

  let job;
  try {
    job = await queue.add(jobName, data);
  } catch (error) {
    try {
      await redis.del(dedupKey);
    } catch (cleanupError) {
      console.error(`[Call Queue] Failed to release ${dedupKey} after enqueue error: ${cleanupError.message}`);
    }
    throw error;
  }

  try {
    await redis.set(
      dedupKey,
      JSON.stringify({ jobId: job.id, queuedAt: new Date().toISOString() }),
      "XX",
      "KEEPTTL"
    );
  } catch (error) {
    console.error(`[Call Queue] Failed to attach job ID to ${dedupKey}:`, error);
  }

  console.log(`[Call Queue] Enqueued ${jobName} as job ${job.id}`);
  return { queued: true, duplicateSuppressed: false, jobId: job.id };
}

export function enqueueAmbulanceCall(data) {
  return enqueueWithDedup(ambulanceCallQueue, "place-ambulance-call", data);
}

export function enqueueFamilyCall(data) {
  return enqueueWithDedup(familyCallQueue, "place-family-call", data);
}
