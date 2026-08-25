# UptimeRobot Monitoring

UptimeRobot is an external HTTP monitoring service. It requires no package, code, account credential, or API integration in this repository.

It should call the backend's lightweight health endpoint, not a chat, upload, or RAG endpoint:

```text
UptimeRobot
     |
     | every 5 minutes
     v
GET /health
     |
     v
Render FastAPI Backend
```

The endpoint is:

```text
https://YOUR-RENDER-SERVICE.onrender.com/health
```

It only confirms that the API process is responding; it does not call an LLM, run retrieval, create embeddings, query the database, or process user data.

## Create the monitor

1. Sign in to [UptimeRobot](https://uptimerobot.com/).
2. Select **Add New Monitor**.
3. Choose **HTTP(s)** as the monitor type.
4. Set a meaningful friendly name, such as `Averion RAG Backend`.
5. Enter `https://YOUR-RENDER-SERVICE.onrender.com/health` as the URL.
6. Select the Free-plan interval: **5 minutes**.
7. Save the monitor.
8. Wait for its first check, then confirm it reports **UP**.

The Free plan uses a five-minute interval. This provides monitoring and can help reduce idle spin-downs on a Render Free Web Service, which can spin down after inactivity. It is not a guarantee that the service will always remain active or avoid cold starts.

If the monitor reports DOWN, first open the same `/health` URL in a browser and inspect the Render service logs. Do not point the monitor at `/chat`, `/documents/upload`, `/health/database`, or `/health/ai`.
