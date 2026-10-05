export const config = { api: { bodyParser: false } }

const TUTOR_INSTRUCTIONS = `You are a rigorous live tutor sharing a whiteboard with the student.
Teach by first principles and problem-first reasoning. Do NOT dump solutions.
Ask one focused question at a time, let the student reason, and correct only when needed.
Treat whiteboard images as the student's current work. If you see a mistake, point to the exact visual idea and ask a guiding question before fixing it.
You can draw on the board using tools. Prefer simple diagrams, labels, arrows, and short equations.
When the student asks you to draw something, use the whiteboard tools.
Keep spoken responses concise and interactive.
The student is learning, so challenge unsupported assumptions and explain WHY before WHAT.`

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).send('Method Not Allowed')
  }
  if (!process.env.OPENAI_API_KEY) return res.status(500).send('Missing OPENAI_API_KEY')

  try {
    const chunks = []
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    const sdp = Buffer.concat(chunks).toString('utf8')
    if (!sdp) return res.status(400).send('Missing SDP offer')

    const session = {
      type: 'realtime',
      model: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2',
      instructions: TUTOR_INSTRUCTIONS,
      audio: {
        output: { voice: 'marin' },
        input: {
          turn_detection: {
            type: 'semantic_vad',
            eagerness: 'medium',
            create_response: true,
            interrupt_response: true
          }
        }
      },
      tools: [
        {
          type: 'function',
          name: 'add_text',
          description: 'Add a short tutor label, equation, hint, or title to the whiteboard.',
          parameters: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              x: { type: 'number' }, y: { type: 'number' },
              fontSize: { type: 'number' }
            },
            required: ['text', 'x', 'y']
          }
        },
        {
          type: 'function',
          name: 'add_box',
          description: 'Draw a rectangle on the whiteboard.',
          parameters: {
            type: 'object',
            properties: {
              x: { type: 'number' }, y: { type: 'number' },
              w: { type: 'number' }, h: { type: 'number' },
              label: { type: 'string' }
            },
            required: ['x', 'y', 'w', 'h']
          }
        },
        {
          type: 'function',
          name: 'add_arrow',
          description: 'Draw an arrow between two points on the whiteboard.',
          parameters: {
            type: 'object',
            properties: {
              x1: { type: 'number' }, y1: { type: 'number' },
              x2: { type: 'number' }, y2: { type: 'number' }
            },
            required: ['x1', 'y1', 'x2', 'y2']
          }
        },
        {
          type: 'function',
          name: 'clear_board',
          description: 'Clear the whiteboard only when the student explicitly asks to start over.',
          parameters: { type: 'object', properties: {} }
        }
      ],
      tool_choice: 'auto'
    }

    const form = new FormData()
    form.append('sdp', sdp)
    form.append('session', new Blob([JSON.stringify(session)], { type: 'application/json' }), 'session.json')

    const upstream = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Safety-Identifier': 'ai-whiteboard-tutor'
      },
      body: form
    })

    const body = await upstream.text()
    res.status(upstream.status).send(body)
  } catch (error) {
    console.error(error)
    res.status(500).send(error instanceof Error ? error.message : String(error))
  }
}
