# Plan 02: Auth Module

> Source PRD: `docs/milestones/auth-and-server/prd-auth-and-server.md`

## Context

Implement user registration, login, logout, and profile retrieval. This task creates the `users` table, the `User` Lucid model, and the `AuthController`. The `auth_access_tokens` table was already created by the `node ace configure @adonisjs/auth` step in task 01.

---

## What to build

### 1. Migration: users table

File: `database/migrations/TIMESTAMP_create_users_table.ts`

```typescript
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('email').unique().notNullable()
      table.string('password').notNullable()
      table.timestamps(true, true)
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
```

### 2. User model

File: `app/auth/models/user.ts`

```typescript
import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email'],
  passwordColumnName: 'password',
})

export default class User extends compose(BaseModel, AuthFinder) {
  static accessTokens = DbAccessTokensProvider.forModel(User)

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare email: string

  @column({ serializeAs: null })
  declare password: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
```

### 3. Auth controller

File: `app/auth/controllers/auth_controller.ts`

```typescript
import type { HttpContext } from '@adonisjs/core/http'
import User from '#auth/models/user'

export default class AuthController {
  async register({ request, response }: HttpContext) {
    const { email, password } = request.only(['email', 'password'])
    const user = await User.create({ email, password })
    return response.created({ id: user.id, email: user.email })
  }

  async login({ request, auth, response }: HttpContext) {
    const { email, password } = request.only(['email', 'password'])
    const user = await User.verifyCredentials(email, password)
    const token = await User.accessTokens.create(user)
    return response.ok({ token })
  }

  async logout({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    await User.accessTokens.delete(user, auth.user!.currentAccessToken.identifier)
    return response.ok({ message: 'logged out' })
  }

  async me({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    return response.ok({ id: user.id, email: user.email })
  }
}
```

### 4. Auth config (`config/auth.ts`)

Update the generated config to point at the User model:

```typescript
import { defineConfig } from '@adonisjs/auth'
import { tokensGuard, tokensUserProvider } from '@adonisjs/auth/access_tokens'

export default defineConfig({
  default: 'api',
  guards: {
    api: tokensGuard({
      provider: tokensUserProvider({
        tokens: 'accessTokens',
        model: () => import('#auth/models/user'),
      }),
    }),
  },
})
```

### 5. Routes (`start/routes.ts`)

Add under the `/api` prefix:

```typescript
import AuthController from '#auth/controllers/auth_controller'

router.group(() => {
  router.post('/auth/register', [AuthController, 'register'])
  router.post('/auth/login',    [AuthController, 'login'])
  router.delete('/auth/logout', [AuthController, 'logout']).use(middleware.auth())
  router.get('/auth/me',        [AuthController, 'me']).use(middleware.auth())
}).prefix('/api')
```

---

## Verification

```bash
node ace migration:run
node ace serve --watch &

# Register
curl -X POST localhost:3333/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@x.com","password":"secret123"}'
# → 201 { id: 1, email: "test@x.com" }

# Login
TOKEN=$(curl -s -X POST localhost:3333/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@x.com","password":"secret123"}' | jq -r '.token.value')

# Me
curl localhost:3333/api/auth/me -H "Authorization: Bearer $TOKEN"
# → 200 { id: 1, email: "test@x.com" }

# Wrong password → 400
curl -X POST localhost:3333/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@x.com","password":"wrong"}'
```

---

## Files created/modified

| File | Action |
|---|---|
| `database/migrations/TIMESTAMP_create_users_table.ts` | Created |
| `app/auth/models/user.ts` | Created |
| `app/auth/controllers/auth_controller.ts` | Created |
| `config/auth.ts` | Modified — point at User model |
| `start/routes.ts` | Modified — auth routes added |
