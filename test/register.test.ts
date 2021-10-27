import Fastify from 'fastify'
import t from 'tap'
import FastifyRBAC from '../lib'
import { checkRBAC, retrieveAccountRoles } from './util'

t.plan(1)
t.test('register', function (t) {
  t.plan(4)
  t.test('no options', async function (t) {
    t.plan(2)
    try {
      const fastify = Fastify()
      await fastify.register(FastifyRBAC)
      await fastify.ready()
      t.fail()
    } catch (err: any) {
      t.equal(err instanceof Error, true)
      t.equal(err.message, '"retrieveAccountRoles" must be function.')
    }
  })

  t.test('only retrieveAccountRoles', async function (t) {
    t.plan(2)
    try {
      const fastify = Fastify()
      // @ts-expect-error
      await fastify.register(FastifyRBAC, { retrieveAccountRoles })
      await fastify.ready()
      t.fail()
    } catch (err: any) {
      t.equal(err instanceof Error, true)
      t.equal(err.message, '"checkRBAC" must be function.')
    }
  })

  t.test('all options', async function (t) {
    t.plan(1)
    const fastify = Fastify()
    await fastify.register(FastifyRBAC, { retrieveAccountRoles, checkRBAC })
    await fastify.ready()
    t.pass()
  })

  t.test('forbiddenMessage', async function (t) {
    t.plan(2)
    const fastify = Fastify()
    await fastify.register(FastifyRBAC, { retrieveAccountRoles, checkRBAC, forbiddenMessage: 'goodbye' })
    fastify.post('/', { config: { rbac: { resource: 'index', operations: ['create'] } } }, async function (t) { return 'index:create' })
    await fastify.ready()

    const response = await fastify.inject({ method: 'POST', url: '/' })
    t.equal(response.statusCode, 403)
    t.equal(response.payload, '{"statusCode":403,"error":"Forbidden","message":"goodbye"}')
  })
})
