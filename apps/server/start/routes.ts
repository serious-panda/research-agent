/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'

const AccessTokenController = () => import('#auth/controllers/access_token_controller')
const NewAccountController = () => import('#auth/controllers/new_account_controller')
const ProfileController = () => import('#auth/controllers/profile_controller')
const ResearchController = () => import('#research/controllers/research_controller')
const ReportsController = () => import('#reports/controllers/reports_controller')

router.get('/health', () => {
  return { status: 'ok' }
})

router
  .group(() => {
    // Auth routes
    router
      .group(() => {
        router.post('register', [NewAccountController, 'store'])
        router.post('login', [AccessTokenController, 'store'])
        router.delete('logout', [AccessTokenController, 'destroy']).use(middleware.auth())
        router.get('me', [ProfileController, 'show']).use(middleware.auth())
      })
      .prefix('auth')

    // Research proxy routes
    router.post('research', [ResearchController, 'stream']).use(middleware.auth())
    router.get('research/:id', [ResearchController, 'show']).use(middleware.auth())

    // Reports proxy routes
    router.get('reports', [ReportsController, 'index']).use(middleware.auth())
    router.get('reports/:id', [ReportsController, 'show']).use(middleware.auth())
  })
  .prefix('/api')
