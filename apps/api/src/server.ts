import { buildApp } from './app.js';
import { readFileSync } from 'node:fs';

const https = process.env.AIWORK_TLS_CERT && process.env.AIWORK_TLS_KEY ? {
  cert: readFileSync(process.env.AIWORK_TLS_CERT),
  key: readFileSync(process.env.AIWORK_TLS_KEY),
} : undefined;
const app=buildApp(https ? { https } : {});
await app.listen({port:Number(process.env.PORT??4300),host:process.env.HOST??'127.0.0.1'});
