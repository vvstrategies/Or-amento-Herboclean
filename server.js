import dotenv from 'dotenv';
import {integrationConfig} from './backend/integration-config.js';
import {startIntegrationScheduler} from './backend/integration-scheduler.js';
import {createApp} from './backend/app.js';
dotenv.config();
const port=Number(process.env.PORT||3000),origin=process.env.APP_ORIGIN||`http://localhost:${port}`;
const {app,integrations}=createApp({origin,integrationConfig:integrationConfig(process.env,origin),routesConfig:{apiKey:process.env.HEIGIT_API_KEY||'',baseUrl:process.env.HEIGIT_API_BASE_URL||'https://api.heigit.org',directionsDailyLimit:Number(process.env.HEIGIT_DIRECTIONS_DAILY_LIMIT||100),geocodingDailyLimit:Number(process.env.HEIGIT_GEOCODING_DAILY_LIMIT||100),cacheHours:Number(process.env.ROUTE_CACHE_HOURS||24)},asaasConfig:{apiKey:process.env.ASAAS_API_KEY,webhookToken:process.env.ASAAS_WEBHOOK_TOKEN,baseUrl:process.env.ASAAS_BASE_URL,environment:process.env.ASAAS_ENV,origin,userAgent:process.env.ASAAS_USER_AGENT},production:process.env.NODE_ENV==='production',dataDir:process.env.DATA_DIR,encryptionKey:process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,googleConfig:{clientId:process.env.GOOGLE_CLIENT_ID,clientSecret:process.env.GOOGLE_CLIENT_SECRET,redirectURI:process.env.GOOGLE_REDIRECT_URI||origin+'/api/google/callback',calendarId:process.env.GOOGLE_CALENDAR_ID||'primary'}});
app.listen(port,'127.0.0.1',()=>console.log(`Herboclean disponível em ${origin}`));

startIntegrationScheduler(integrations);

