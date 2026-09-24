# GuardianSync Server

Express, Socket.IO, MongoDB, and SCADA simulation service.

## Deploy

Use a persistent Node host such as Render, Railway, or Fly.io. Vercel serverless functions do not support the long-lived Socket.IO connection and background simulation reliably.

- Install: `npm install`
- Start: `npm start`
- Health: `/api/health`
- Configure variables from `.env.example`

Never commit `.env` files or credentials.
