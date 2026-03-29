import User from '#auth/models/user'
import { signupValidator } from '#auth/validators/user'
import type { HttpContext } from '@adonisjs/core/http'
import UserTransformer from '#auth/transformers/user_transformer'

export default class NewAccountController {
  async store({ request, serialize }: HttpContext) {
    const { fullName, email, password } = await request.validateUsing(signupValidator)

    const user = await User.create({ fullName, email, password })
    const token = await User.accessTokens.create(user)

    return serialize({
      user: UserTransformer.transform(user),
      token: { value: token.value!.release() },
    })
  }
}
