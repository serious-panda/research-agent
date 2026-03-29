import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'

export default class ReportsController {
  async index({ response }: HttpContext) {
    const upstream = await fetch(`${env.get('AGENT_API_URL')}/api/reports`)
    const data = await upstream.json()
    return response.status(upstream.status).json(data)
  }

  async show({ params, response }: HttpContext) {
    const upstream = await fetch(`${env.get('AGENT_API_URL')}/api/reports/${params.id}`)
    const data = await upstream.json()
    return response.status(upstream.status).json(data)
  }
}
