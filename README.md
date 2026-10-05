# AI Whiteboard Tutor — Vercel V1

A browser-based AI tutor with:

- voice conversation through OpenAI Realtime/WebRTC
- shared tldraw whiteboard
- automatic canvas snapshots sent as image input
- AI drawing tools: text, boxes, arrows, clear board
- problem-first / first-principles tutoring behavior
- Vercel deployment with the OpenAI API key kept server-side

## Deploy to Vercel

### 1. Put this folder in GitHub

Create a GitHub repository and upload the contents of this folder.

### 2. Import the repository into Vercel

In Vercel: **Add New → Project → Import Git Repository**.

The project uses Vite, so Vercel will run `npm run build` and serve `dist`.

### 3. Add the environment variable

Vercel Project → **Settings → Environment Variables**:

```text
OPENAI_API_KEY=sk-...
OPENAI_REALTIME_MODEL=gpt-realtime-2
```

Add them to Production (and Preview if you want preview deployments).

### 4. Deploy

Click **Deploy**.

Your site will receive a `*.vercel.app` URL.

## Local development

```bash
npm install
npm run dev
```

The Vite dev server proxies `/api` to the Vercel function only when using Vercel tooling. For the easiest local API test, use:

```bash
npm i -g vercel
vercel dev
```

Then open the local URL shown by Vercel.

## Architecture

```text
Browser
  ├── tldraw canvas
  ├── microphone
  └── WebRTC
       │
       ▼
Vercel Function: /api/realtime
       │
       ├── private OPENAI_API_KEY
       └── POST /v1/realtime/calls
                    │
                    ▼
             OpenAI Realtime
                    │
             ┌──────┴──────┐
             ▼             ▼
          voice          tools
                           │
                           ▼
                    tldraw editor

Canvas changes ──► JPEG snapshot ──► Realtime input_image
```

## Security

`OPENAI_API_KEY` is intentionally **not** a `NEXT_PUBLIC_` variable and is never shipped to the browser. Vercel environment variables are read by the server/function at runtime.

Do not commit `.env` or `.env.local`.

## Important V1 behavior

The tutor sends a canvas image after drawing changes. It does not continuously stream the entire whiteboard video. This keeps bandwidth and model cost much lower while still allowing the tutor to inspect the student's work.
