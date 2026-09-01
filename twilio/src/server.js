import "dotenv/config";
import express from 'express';
import http from 'http';
import { connectRedis } from './config/redis.js';

const REQUIRED_ENV_VARS = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_NUMBER',
  'PUBLIC_URL',
  'GEMINI_API_KEY',
  'PORT',
  'REDIS_URL',
  'PATIENT_ADDRESS',
  'USER_NUMBER',
  'EMERGENCY_FALLBACK_NUMBER'
];

async function startServer() {
  const missingEnvVars = REQUIRED_ENV_VARS.filter(name => !process.env[name]?.trim());
  if (missingEnvVars.length > 0) {
    console.error(`[Startup] Missing required environment variables: ${missingEnvVars.join(', ')}`);
    process.exit(1);
  }

  try {
    await connectRedis();
  } catch {
    process.exit(1);
  }

  const [
    { default: triggerRouter },
    { default: familyRouter },
    { default: ambulanceRouter },
    { default: smsRouter },
    { startAmbulanceWorker },
    { startFamilyWorker }
  ] = await Promise.all([
    import('./routes/trigger.routes.js'),
    import('./routes/family.routes.js'),
    import('./routes/ambulance.routes.js'),
    import('./routes/sms.routes.js'),
    import('./queues/ambulanceWorker.js'),
    import('./queues/familyWorker.js')
  ]);

  // Workers share this process for a single deployment entry point; their modules remain separable for a later worker-only process.
  const workers = [startAmbulanceWorker(), startFamilyWorker()];
  await Promise.all(workers.map(worker => worker.waitUntilReady()));

  const app = express();
  const server = http.createServer(app);

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use('/', triggerRouter); // therapist call
  app.use('/', familyRouter);
  app.use('/', ambulanceRouter);
  app.use('/', smsRouter);

  server.listen(process.env.PORT, () => {
    console.log(`Server and call workers running on port ${process.env.PORT}`);
  });
}

startServer().catch((error) => {
  console.error(`[Startup] Failed to start service: ${error.message}`);
  process.exit(1);
});
