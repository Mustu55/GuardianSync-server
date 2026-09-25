# GuardianSync Server

## Deploy on Render

Create a **Web Service** from this `server` directory, or deploy the repository with its root directory set to `server`.

- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/api/health`

Set the variables listed in `.env.example` in Render's Environment settings. Use the deployed AI engine URL and the deployed client URL for `AI_ENGINE_URL` and `CORS_ORIGIN`.

The server is intended to run as a persistent Node service because it uses Socket.IO and background jobs. Do not deploy it as a Vercel Function.

## Keeping the free service available

Render's free service may spin down after inactivity. Configure an external uptime monitor, such as UptimeRobot or Better Uptime, to send a `GET` request to:

`https://<render-service>.onrender.com/api/health`

Use an interval of 5 to 10 minutes. A self-ping inside this process cannot prevent sleeping because the process is stopped when Render suspends it.

## Client variables

After the Render URL is available, configure the client build with:

```dotenv
VITE_API_URL=https://<render-service>.onrender.com/api
VITE_SOCKET_URL=https://<render-service>.onrender.com
```