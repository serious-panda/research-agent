import type { HttpContext } from '@adonisjs/core/http'
import { getQuotaStatus } from '#research/services/quota_service'

export default class UsageController {
  async show({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const status = await getQuotaStatus(user.id)
    return response.json(status)
  }
}
