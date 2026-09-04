# NeuroBridge

NeuroBridge is a health-monitoring **prototype** that combines a simulated wearable, a web dashboard, Python agent workflows, and Twilio voice/SMS notifications. Health readings are stored in MongoDB; call state and outbound call queues use Redis.

> This is not a medical device or a replacement for professional care or emergency services. Simulator readings and AI-generated assessments are for demonstration only. Test calls and SMS only with consenting recipients and numbers you control. Never use real emergency-service numbers for automated testing.

## Project structure

| Folder | Purpose | Main technologies | Local port |
| --- | --- | --- | --- |
| `frontend/` | Dashboard, profile, and simulator test page | React, TypeScript, Vite, Tailwind | 8080 |
| `backend/` | Authentication, profiles, and health-data API | Node.js, Express, Mongoose | 5000 |
| `simulator/` | Generates synthetic wearable readings | Node.js, Express, Socket.IO | 4000 |
| `agent/` | Validates/stores readings and runs health workflows | Python, Pydantic, LangGraph, Gemini, PyMongo | No HTTP port |
| `twilio/` | Therapist calls, queued ambulance/family calls, and SMS | Node.js, Express, Twilio, Gemini, Redis, BullMQ | 3000 |

```text
Simulator --Socket.IO--> Python agent --> MongoDB Atlas
                              |                |
                              |           Backend API <-- Frontend dashboard
                              v
                       Twilio service <--> Redis / BullMQ
                              |
                        Twilio Voice / SMS
                              |
                       Public HTTPS webhooks
```

The recommended demo setup runs **backend, frontend, simulator, and agent locally**, with **the Twilio service and Redis on Render**, and **MongoDB on Atlas**. Docker and ngrok are not needed for this setup. There is no root-level command that starts every service.

## 1. Prerequisites

- Node.js and npm installed.
- Python installed, with the Windows `py` launcher available.
- A MongoDB Atlas account and cluster.
- A Gemini API key with access to the model configured in the source.
- A Twilio account, an SMS/voice-capable Twilio number, and permitted test recipients. Trial accounts have recipient restrictions.
- A Render account and a Git repository containing the project.

The commands below use PowerShell and assume the repository is at `D:\Projects\neuroBridge`. Change that path if your checkout is elsewhere.

## 2. Keep secrets out of Git

Check the existing `.gitignore` files **before** committing configuration. Real `.env` files, `.venv/`, and `node_modules/` must remain ignored. Files named `.env.example` are intentionally tracked: they document configuration without containing real credentials.

Never put MongoDB passwords, Twilio tokens, Gemini keys, or JWT secrets into the README, frontend source, or `.env.example`. Frontend `VITE_*` values are visible to browser users and must not contain secrets.

If a real secret has already been committed, adding `.gitignore` does not remove it from Git history. Rotate the credential and address the tracked file/history separately.

## 3. Create MongoDB Atlas configuration

1. Create an Atlas project and a cluster.
2. Under **Database Access**, create a database user with a strong password and permission to read/write the application's database. This is different from your Atlas login.
3. Under **Network Access**, allow the public IP of the computer running the backend and agent. Update this if your IP changes.
4. Choose **Connect → Drivers** and copy the connection string.
5. Replace the username/password placeholders and include the database name:

```dotenv
mongodb+srv://<database-user>:<url-encoded-password>@<cluster-host>/health_data_db?retryWrites=true&w=majority
```

Use **the same cluster and `health_data_db` database** in both backend and agent configuration. The agent currently selects `health_data_db` in its code. URL-encode reserved characters in the password; do not leave placeholder brackets in the real URI.

Collections are created as the app writes data; you do not need to create them manually. For more detail, see [Atlas connection requirements](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/).

## 4. Install dependencies

Run once from PowerShell:

```powershell
cd D:\Projects\neuroBridge\backend
npm ci

cd D:\Projects\neuroBridge\frontend
npm ci

cd D:\Projects\neuroBridge\simulator
npm ci

cd D:\Projects\neuroBridge\agent
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Render installs the Twilio service dependencies during deployment. To develop that service locally as well:

```powershell
cd D:\Projects\neuroBridge\twilio
npm ci
```

## 5. Create local environment files

Copy each folder's `.env.example` to `.env` **only if `.env` does not already exist**, then edit the values. Preserve existing working credentials.

### `backend/.env`

```dotenv
MONGO_URI=mongodb+srv://<database-user>:<url-encoded-password>@<cluster-host>/health_data_db?retryWrites=true&w=majority
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:8080
ACCESS_TOKEN_SECRET_KEY=<long-random-secret>
ACCESS_TOKEN_EXPIRY_DATE=15m
REFRESH_TOKEN_SECRET_KEY=<different-long-random-secret>
REFRESH_TOKEN_EXPIRY_DATE=7d
```

Use different, randomly generated secrets for access and refresh tokens. Keep `NODE_ENV=development` for local HTTP testing.

### `frontend/.env`

```dotenv
VITE_API_URL=http://localhost:5000/api
VITE_SIMULATOR_URL=http://localhost:4000
VITE_EMERGENCY_NUMBER=<your-consenting-test-phone-number>
```

The emergency button is separate from automated ambulance calls. The supplied example uses a real emergency number; replace it with your test number before testing the button. Keep `localhost` consistent across frontend/backend URLs rather than mixing it with `127.0.0.1`.

### `simulator/.env`

```dotenv
PORT=4000
PATIENT_USER_ID=<registered-user-mongodb-id>
```

You will obtain `PATIENT_USER_ID` in step 7. It must be the logged-in user's MongoDB ID, not their email, name, or the ID of their personal-details record.

### `agent/.env`

```dotenv
MONGODB_URI=mongodb+srv://<database-user>:<url-encoded-password>@<cluster-host>/health_data_db?retryWrites=true&w=majority
GOOGLE_API_KEY=<gemini-api-key>
SIMULATOR_URL=http://localhost:4000
TWILIO_SERVICE_URL=https://<your-twilio-service>.onrender.com
AMBULANCE_NUMBER=<consenting-test-number-in-E164-format>
PATIENT_PHONE_NUMBER=<consenting-patient-test-number-in-E164-format>
DIAGNOSIS_INTERVAL_MINUTES=1440
PERIODIC_WELLNESS_INTERVAL_MINUTES=180
ENABLE_ROUTINE_WELLNESS_SMS=false
```

Use the Render URL created below, without a trailing slash. Phone numbers should include the country code, for example `+<country-code><number>`.

`ENABLE_ROUTINE_WELLNESS_SMS=false` disables routine daily/periodic wellness SMS. It does **not** disable emergency notifications, diagnosis-related concern notifications, calls, or the ambulance-failure SMS fallback.

Notice the different names: backend uses `MONGO_URI`; agent uses `MONGODB_URI`. Agent uses `GOOGLE_API_KEY`; the Twilio service uses `GEMINI_API_KEY`.

## 6. Deploy the Twilio service on Render

### A. Create Redis

1. Push the project to your Git provider after checking that secrets are ignored.
2. In Render, create a **Key Value** instance.
3. Choose the same region/workspace that you will use for the Twilio web service.
4. Set its eviction policy to **`noeviction`**, which is appropriate for the job queue.
5. Copy its **internal connection URL** for the Render web service's `REDIS_URL`.

Internal URLs are for Render services on the private network, not your local computer. See [Render Key Value documentation](https://render.com/docs/key-value).

### B. Create the web service

Create a Render **Web Service** connected to the repository with:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Root Directory | `twilio` |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Region | Same as Redis |

Add these variables in Render's environment settings:

```dotenv
TWILIO_ACCOUNT_SID=<twilio-account-sid>
TWILIO_AUTH_TOKEN=<twilio-auth-token>
TWILIO_NUMBER=<your-twilio-number-in-E164-format>
PUBLIC_URL=https://<your-twilio-service>.onrender.com
GEMINI_API_KEY=<gemini-api-key>
REDIS_URL=<render-internal-redis-url>
PATIENT_ADDRESS=<fictional-demo-patient-address>
USER_NUMBER=<consenting-therapist-call-recipient-in-E164-format>
EMERGENCY_FALLBACK_NUMBER=<consenting-fallback-sms-recipient-in-E164-format>
```

Render supplies `PORT`; the service requires it to be present. For local use, set `PORT=3000` in `twilio/.env` along with the other variables above.

If Render has not assigned your service URL when you enter the variables, temporarily use `PUBLIC_URL=https://temporary.invalid`. Deploy to obtain the real URL, replace `PUBLIC_URL`, and redeploy **before making any calls**. Then put that real URL in `agent/.env` as `TWILIO_SERVICE_URL`.

The Twilio service validates required variables and connects to Redis before listening. Both BullMQ workers start in the web-service process; there is no separate worker command to run for this setup.

The app supplies callback URLs when creating outbound Twilio calls. `PUBLIC_URL` must therefore be the publicly reachable HTTPS address of this service, not a localhost URL. Incoming-call configuration in the Twilio console is a separate concern.

There is no `GET /` health route: opening the base URL may show `Cannot GET /` even when the server is running. Do not configure `/` as an HTTP health-check path or use a call-creation endpoint as a health check; leave Render's default TCP check in place.

**Hosting limitations:** Render free web services sleep after inactivity and can take about a minute to wake, which can interrupt this app's call workflow. Use an always-on plan for reliable demonstrations. Free Key Value storage is not persistent across restarts. See [Render free-service limitations](https://render.com/docs/free) and [Key Value persistence](https://render.com/docs/key-value).

## 7. Register a patient and finish their profile

Start backend and frontend in two separate terminals:

**Terminal 1 — backend**

```powershell
cd D:\Projects\neuroBridge\backend
npm run dev
```

**Terminal 2 — frontend**

```powershell
cd D:\Projects\neuroBridge\frontend
npm run dev
```

1. Open [http://localhost:8080](http://localhost:8080), register, and sign in.
2. Open **Profile → Edit**. Fill in the patient's phone number, address, and emergency contact, then save. Email remains read-only.
3. Use consenting test numbers, including for the emergency contact. Missing `emergencyContact` prevents the family notification workflow.
4. In the same signed-in browser, open [http://localhost:5000/api/user/me](http://localhost:5000/api/user/me). Copy `data._id` into `simulator/.env` as `PATIENT_USER_ID`.
5. You can also inspect [http://localhost:5000/api/personal/me](http://localhost:5000/api/personal/me) to confirm the saved emergency contact. These endpoints require your login cookie.

Do not share the returned personal data or login tokens publicly.

## 8. Start the remaining services

Keep backend and frontend running, then open two more terminals.

**Terminal 3 — simulator**

```powershell
cd D:\Projects\neuroBridge\simulator
npm start
```

**Terminal 4 — agent**

```powershell
cd D:\Projects\neuroBridge\agent
.\.venv\Scripts\python.exe main.py
```

Run the agent command from PowerShell, not from Python's `>>>` prompt. If you see `>>>`, enter `exit()` first. Activating the virtual environment is unnecessary when using the full interpreter path above.

The simulator emits realtime data every 5 seconds and daily data every 60 seconds. The agent validates it and saves it to MongoDB; the dashboard reads it through the backend. Give daily data at least a minute to arrive. Blood pressure is simulated, not measured by a connected device.

For later sessions, use the same four terminal commands in this order: **backend → frontend → simulator → agent**. The Render Twilio service and Redis must also be available. Stop a local process with `Ctrl+C`. Restart affected services after changing `.env` files.

### Optional: run Twilio locally instead

Set all variables in `twilio/.env`, including a Redis URL reachable from your computer, then run:

```powershell
cd D:\Projects\neuroBridge\twilio
npm start
```

Use `TWILIO_SERVICE_URL=http://localhost:3000` in the agent. Twilio still needs a **public HTTPS tunnel URL** as `PUBLIC_URL` to reach voice callbacks. Docker is just one optional way to run local Redis; it is not an application requirement. Do not run this local service against the production queue unless you intend it to consume those jobs.

## Testing the project

### Dashboard and simulator

1. Confirm the agent logs MongoDB and simulator connections without validation errors.
2. Open the dashboard and check heart rate, blood pressure, sleep, and steps.
3. Use [the Test System page](http://localhost:8080/test) to change simulated readings.
4. Before testing abnormal scenarios, verify every configured destination is a consenting test number. Abnormal readings can trigger real paid calls/SMS.
5. Reset the scenario after testing. Resetting simulator values does not cancel queued calls or remove notification cooldown records.

The test page is intentionally included for this prototype. Simulator overrides are global; use one demo patient at a time.

### Manual voice-call test

These requests create real calls. Replace placeholders and run deliberately, not as health checks. For predictable manual tests, stop the agent first so a simulator scenario cannot initiate a second workflow.

```powershell
$callServiceUrl = 'https://<your-twilio-service>.onrender.com'

# Calls USER_NUMBER configured on the Twilio service.
$therapistCall = Invoke-RestMethod -Uri "$callServiceUrl/trigger-call" -Method Get
$therapistSid = $therapistCall.sid
```

Answer, speak to the agent, and finish the call. Check completion:

```powershell
Invoke-RestMethod -Uri "$callServiceUrl/get-emotion/$therapistSid" -Method Get
```

Once the call is completed and has a conversation transcript:

```powershell
Invoke-RestMethod -Uri "$callServiceUrl/generate-final-emotion/$therapistSid" -Method Post
Invoke-RestMethod -Uri "$callServiceUrl/generate-summary/$therapistSid" -Method Post

$familyPayload = @{
    therapistCallSid = $therapistSid
    familyNumber = '<consenting-family-test-number>'
} | ConvertTo-Json
Invoke-RestMethod -Uri "$callServiceUrl/family-call" -Method Post -ContentType 'application/json' -Body $familyPayload
```

To test the ambulance queue separately, use a fictional patient/address and your own test phone:

```powershell
$ambulanceTestNumber = [uri]::EscapeDataString('<consenting-ambulance-test-number>')
$demoPatient = [uri]::EscapeDataString('Demo Patient')
$demoAddress = [uri]::EscapeDataString('Fictional demo address - test only')
$demoAlertId = [guid]::NewGuid().ToString()
$ambulanceTestUrl = "$callServiceUrl/ambulance-call?ambulanceNumber=$ambulanceTestNumber&patientName=$demoPatient&patientAddress=$demoAddress&alertId=$demoAlertId"
Invoke-RestMethod -Uri $ambulanceTestUrl -Method Get
```

Reusing the exact same alert ID within the deduplication window should suppress a duplicate ambulance job. Reusing the therapist call SID should suppress a duplicate family job. A `queued: true` response means the job was accepted, **not** that a recipient answered or that an ambulance was dispatched.

### How outbound call reliability works

- Ambulance and family requests check a Redis deduplication key and enqueue a BullMQ job. The deduplication window is 10 minutes.
- Ambulance requests use an alert/trigger ID when supplied; otherwise they derive a key from patient name, address, and a rounded minute. Family requests use the therapist call SID.
- Workers create Twilio calls with up to **3 total attempts**, using exponential backoff starting at 2 seconds. Retries apply to failed call-creation requests, not to downstream Gemini responses, failed webhooks, busy signals, or unanswered calls.
- On final ambulance call-creation failure, the worker attempts an SMS to `EMERGENCY_FALLBACK_NUMBER` containing the patient details and the label `AUTOMATED AMBULANCE CALL FAILED — MANUAL FOLLOW-UP REQUIRED`. Monitor logs: the fallback SMS itself can also fail.
- On final family call-creation failure, the worker logs `[CRITICAL]` and records failure details in the therapist call's result state.
- Retries run outside the HTTP request so the request can return promptly. This is not an exactly-once dispatch guarantee; ambiguous provider/network failures still require operational care.

### Static checks

These checks do not place calls:

```powershell
cd D:\Projects\neuroBridge\frontend
npm run build
npm run lint

cd D:\Projects\neuroBridge\backend
node --check src/index.js

cd D:\Projects\neuroBridge\simulator
node --check src/index.js

cd D:\Projects\neuroBridge\twilio
node --check src/server.js

cd D:\Projects\neuroBridge\agent
.\.venv\Scripts\python.exe -m py_compile main.py
```

Syntax checks are not end-to-end tests. The simulator and Twilio `npm test` scripts are currently placeholders, not an automated test suite.

## Main HTTP endpoints

Backend routes below use the `/api` prefix; profile and health routes require authentication.

| Service | Method and path | Purpose |
| --- | --- | --- |
| Backend | `POST /api/user/register`, `POST /api/user/login` | Account creation and login |
| Backend | `GET /api/user/me`, `PATCH /api/user/me` | Read/update account details |
| Backend | `GET /api/personal/me`, `PUT /api/personal/me` | Read/save personal details and emergency contact |
| Backend | `GET /api/realtime/latest`, `GET /api/daily/latest` | Latest health readings |
| Backend | `GET /api/dashboard/daily` | Dashboard data |
| Twilio | `GET /trigger-call` | Start a therapist call to configured `USER_NUMBER`; returns `sid` |
| Twilio | `GET /get-emotion/:sid` | Read call result/emotion state |
| Twilio | `POST /generate-final-emotion/:sid` | Generate final emotion from the transcript |
| Twilio | `POST /generate-summary/:sid` | Generate a completed-call summary |
| Twilio | `POST /family-call` | Queue a family call using `therapistCallSid` and `familyNumber` |
| Twilio | `GET /ambulance-call` | Queue an ambulance notification call using query parameters |
| Twilio | `POST /send-sms` | Send SMS using `phoneNumber` and `message` |

Voice/speech/status webhook handlers are used by Twilio during calls; they are not browser pages. Queue-based initiation responses include fields such as `queued`, `jobId`, and duplicate status; a newly queued family call may not yet have a Twilio call SID.

## State and deployment notes

MongoDB stores accounts, personal details, readings, and notification history. Redis stores JSON-encoded call data under `call:{callSid}:conversation`, `:result`, `:emotion`, `:summary`, `:context`, and `:family`. These call-state keys have a 24-hour TTL refreshed on writes; some context/family state is explicitly deleted earlier when the call ends.

Redis TTL replaces manual cleanup timers for migrated state. Deduplication keys expire after 10 minutes. BullMQ job records are separate from call-state keys and do not inherit the 24-hour TTL; job-history retention needs separate operational management.

`llmChains` intentionally stays in memory because it contains live JavaScript Promises. Shared Redis state lets different service instances access call context, and BullMQ coordinates job consumption, but `llmChains` is **not a distributed lock**. Do not assume the entire prototype is horizontally safe merely because its storage is shared. The simulator is global/single-patient, and therapist initiation currently targets the configured `USER_NUMBER`.

## Troubleshooting

| Symptom | Check / action |
| --- | --- |
| `NameError: name 'main' is not defined` | Exit Python's `>>>` prompt and run `.\.venv\Scripts\python.exe main.py` in PowerShell from `agent/`. |
| `userId` missing in realtime/daily data | Set the simulator's `PATIENT_USER_ID` to the registered user's ID. Stop any old simulator, restart the current simulator, then restart the agent. |
| Dashboard has no data | Confirm simulator/agent are running, MongoDB URI/database match, the simulator ID matches the signed-in user, and the agent has no validation errors. Wait at least a minute for daily data. |
| Blood pressure is unavailable | Restart the updated simulator and agent; new realtime records must contain `blood_pressure.systolic` and `blood_pressure.diastolic`. Historical records may lack these fields. |
| Profile fields appear disabled | Click **Edit** first. Email is intentionally read-only. Save an emergency contact and patient phone number. |
| `Patient personal details do not include an emergencyContact` | Save the contact in Profile for the same user identified by simulator data. Verify `/api/personal/me`. |
| MongoDB connection/authentication fails | Check Atlas database-user credentials, URL-encoded password, current IP allowlist, and the `health_data_db` database name. |
| API returns unauthorized / profile stops loading | Sign in again; the example access-token lifetime is 15 minutes. Keep local URLs consistently on `localhost`. |
| Twilio service refuses startup | Check its missing-variable error and Redis connection logs. Render's internal Redis URL is not reachable from a local process. |
| Render shows `Cannot GET /` | Expected for this service's unimplemented root route. Check deployment/startup logs instead. |
| Call connects but voice callbacks fail | Verify `PUBLIC_URL` is the correct public HTTPS service URL and inspect Twilio/Render logs. Check for a sleeping free Render service. |
| Repeated test produces no new call | Check the 10-minute queue deduplication window and MongoDB-backed workflow cooldowns. Simulator reset does not clear these. |
| Gemini reports model/key/quota errors | Verify key access and quota. Model names are currently hardcoded (`gemini-3.1-flash-lite`), not controlled by an environment variable. |
| Routine wellness SMS are unwanted | Keep `ENABLE_ROUTINE_WELLNESS_SMS=false` and restart the agent. Emergency and other concern notifications remain separate. |

## Prototype limitations

- Synthetic data and model-generated severity labels are not diagnoses. Blood pressure is displayed, but current realtime emergency thresholds do not use it.
- Call creation, queue acceptance, or an AI classification is not confirmation of a successful emergency response.
- Public call/SMS endpoints need appropriate access controls and operational safeguards before broader deployment; do not treat this demo as a secured production service.
- Review queue retention, distributed concurrency, monitoring, secrets, privacy, and failure handling before serving real patients or multiple independent users.
