import redis from "../config/redis.js";

const CALL_STATE_TTL_SECONDS = 24 * 60 * 60;

const appendToArrayScript = `
local current = redis.call("GET", KEYS[1])
local items = {}
if current then
  items = cjson.decode(current)
end
table.insert(items, cjson.decode(ARGV[1]))
local encoded = cjson.encode(items)
redis.call("SET", KEYS[1], encoded, "EX", ARGV[2])
return encoded
`;

const mergeObjectScript = `
local current = redis.call("GET", KEYS[1])
local target = {}
if current then
  target = cjson.decode(current)
end
local patch = cjson.decode(ARGV[1])
for key, value in pairs(patch) do
  target[key] = value
end
local encoded = cjson.encode(target)
redis.call("SET", KEYS[1], encoded, "EX", ARGV[2])
return encoded
`;

const appendToFamilyConversationScript = `
local current = redis.call("GET", KEYS[1])
local family = { conversation = {} }
if current then
  family = cjson.decode(current)
end
if not family["conversation"] then
  family["conversation"] = {}
end
table.insert(family["conversation"], cjson.decode(ARGV[1]))
local encoded = cjson.encode(family)
redis.call("SET", KEYS[1], encoded, "EX", ARGV[2])
return encoded
`;

function callKey(callSid, suffix) {
  return `call:${callSid}:${suffix}`;
}

async function getJson(key) {
  const value = await redis.get(key);
  return value === null ? null : JSON.parse(value);
}

async function setJson(key, value) {
  await redis.set(key, JSON.stringify(value), "EX", CALL_STATE_TTL_SECONDS);
  return value;
}

export function getConversation(callSid) {
  return getJson(callKey(callSid, "conversation"));
}

export function setConversation(callSid, conversation) {
  return setJson(callKey(callSid, "conversation"), conversation);
}

export async function appendToConversation(callSid, message) {
  const value = await redis.eval(
    appendToArrayScript,
    1,
    callKey(callSid, "conversation"),
    JSON.stringify(message),
    CALL_STATE_TTL_SECONDS
  );
  return JSON.parse(value);
}

export function deleteConversation(callSid) {
  return redis.del(callKey(callSid, "conversation"));
}

export function getCallResult(callSid) {
  return getJson(callKey(callSid, "result"));
}

export async function setCallResult(callSid, patch) {
  const value = await redis.eval(
    mergeObjectScript,
    1,
    callKey(callSid, "result"),
    JSON.stringify(patch),
    CALL_STATE_TTL_SECONDS
  );
  return JSON.parse(value);
}

export function deleteCallResult(callSid) {
  return redis.del(callKey(callSid, "result"));
}

export function getEmotionalState(callSid) {
  return getJson(callKey(callSid, "emotion"));
}

export function setEmotionalState(callSid, emotionalState) {
  return setJson(callKey(callSid, "emotion"), emotionalState);
}

export function deleteEmotionalState(callSid) {
  return redis.del(callKey(callSid, "emotion"));
}

export function getSummary(callSid) {
  return getJson(callKey(callSid, "summary"));
}

export function setSummary(callSid, summary) {
  return setJson(callKey(callSid, "summary"), summary);
}

export function deleteSummary(callSid) {
  return redis.del(callKey(callSid, "summary"));
}

export function getCallContext(callSid) {
  return getJson(callKey(callSid, "context"));
}

export function setCallContext(callSid, context) {
  return setJson(callKey(callSid, "context"), context);
}

export function deleteCallContext(callSid) {
  return redis.del(callKey(callSid, "context"));
}

export function getFamilyConversation(callSid) {
  return getJson(callKey(callSid, "family"));
}

export function setFamilyConversation(callSid, familyConversation) {
  return setJson(callKey(callSid, "family"), familyConversation);
}

export async function appendToFamilyConversation(callSid, message) {
  const value = await redis.eval(
    appendToFamilyConversationScript,
    1,
    callKey(callSid, "family"),
    JSON.stringify(message),
    CALL_STATE_TTL_SECONDS
  );
  return JSON.parse(value);
}

export function deleteFamilyConversation(callSid) {
  return redis.del(callKey(callSid, "family"));
}
