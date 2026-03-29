import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'

export default class ResearchController {
  /**
   * SSE proxy — streams agent-api response directly to the browser.
   * AdonisJS v6 natively pipes a native Response without buffering.
   */
  async stream({ request }: HttpContext) {
    const body = request.body()
    const upstream = await fetch(`${env.get('AGENT_API_URL')}/api/research`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    return upstream
  }

  /**
   * Fetch a completed research run by thread_id.
   */
  async show({ params, response }: HttpContext) {
    const upstream = await fetch(`${env.get('AGENT_API_URL')}/api/research/${params.id}`)
    const data = await upstream.json()
    return response.status(upstream.status).json(data)
  }
}
