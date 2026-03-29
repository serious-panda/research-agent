import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'research_usage'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()

      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')

      // Set at request start
      table.string('effort', 10).notNullable().defaultTo('high')
      table.integer('estimated_credits').notNullable().defaultTo(0)

      // Updated from agent done event (null while in-flight or if run failed)
      table.integer('actual_credits').nullable()
      table.integer('searches_done').nullable()
      table.integer('links_evaluated').nullable()

      // pending → completed | failed
      table.string('status', 20).notNullable().defaultTo('pending')

      table.string('thread_id', 100).nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })

    // Fast quota window queries: sum credits within time range per user
    this.schema.raw(`
      CREATE INDEX research_usage_user_created_idx
        ON research_usage (user_id, created_at)
    `)
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
