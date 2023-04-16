import { FastifyInstance } from 'fastify'
import { knex } from '../database'
import { z } from 'zod'
import crypto from 'node:crypto'
import { checkSessionIdExists } from '../middlewares/check-session-id-exists'

// Coockies <-> Formas da gente manter contexto entre requisições

// Teste unitários: unidade de sua aplicação
// Teste integração: comunicação entre duas ou mais unidades
// Teste e2e - ponta a ponta: simulam um usuário operando na nossa aplicação

// front-end: abre a página de login, preenche o formulário, clica no botão de login
// back-end: chamada HTTP, WebSockets, GraphQL, etc
// Pirâmide de testes:
// E2E (não depende de nenhuma tecnologia, não depende de arquitetura)
// Integração
// Unidade

export const transactionsRoutes = async (app: FastifyInstance) => {
  app.addHook('preHandler', async (request, reply) => {
    console.log(`[${request.method}] ${request.url}`)
  })

  app.get(
    '/',
    { preHandler: [checkSessionIdExists] },
    async (request, reply) => {
      const { sessionId } = request.cookies

      const transactions = await knex('transactions')
        .where('session_id', sessionId)
        .select()

      return { transactions }
    },
  )

  app.get('/:id', { preHandler: [checkSessionIdExists] }, async (request) => {
    const getTransactionsParamsSchema = z.object({
      id: z.string().uuid(),
    })

    const { id } = getTransactionsParamsSchema.parse(request.params)
    const { sessionId } = request.cookies

    const transaction = await knex('transactions')
      .where({ id, session_id: sessionId })
      .first()

    return { transaction }
  })

  app.get(
    '/summary',
    { preHandler: [checkSessionIdExists] },
    async (request) => {
      const { sessionId } = request.cookies
      const summary = await knex('transactions')
        .where('session_id', sessionId)
        .sum('amount', { as: 'amount' })
        .first()

      return { summary }
    },
  )

  app.post('/', async (request, reply) => {
    const createTransactionSchema = z.object({
      title: z.string(),
      amount: z.number(),
      type: z.enum(['credit', 'debit']),
    })

    const { title, amount, type } = createTransactionSchema.parse(request.body)

    let sessionId = request.cookies.sessionId

    if (!sessionId) {
      sessionId = crypto.randomUUID()
      reply.cookie('sessionId', sessionId, {
        path: '/',
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      })
    }

    await knex('transactions').insert({
      id: crypto.randomUUID(),
      title,
      amount: type === 'credit' ? amount : amount * -1,
      session_id: sessionId,
    })

    return reply.status(201).send({ message: 'Transaction created!' })
  })
}
