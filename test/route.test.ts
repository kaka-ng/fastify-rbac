import Fastify, { FastifyInstance } from 'fastify'
import t from 'tap'
import FastifyRBAC from '../lib'
import { checkRBAC, retrieveAccountRoles } from './util'

t.plan(1)
t.test('route rbac', async function (t) {
  t.plan(4)
  const fastify: FastifyInstance = Fastify()
  await fastify.register(FastifyRBAC, { retrieveAccountRoles, checkRBAC })
  fastify.get('/', { config: { rbac: { resource: 'index', operations: ['read'] } } }, async function (t) { return 'index:read' })
  fastify.post('/', { config: { rbac: { resource: 'index', operations: ['create'], checkRBAC () { return true } } } }, async function (t) { return 'index:create' })
  fastify.put('/', { config: { rbac: { resource: 'index', operations: ['update'], skip: true } } }, async function (t) { return 'index:update' })
  await fastify.ready()

  t.test('fastify.rbac', function (t) {
    t.plan(2)
    t.equal(fastify.rbac.roles.length, 1 + 3)
    t.same(Array.from(fastify.rbac.routeRBAC.keys()), ['GET:/', 'POST:/', 'PUT:/'])
  })

  t.test('match rbac', async function (t) {
    t.plan(2)
    const response = await fastify.inject({ method: 'GET', url: '/' })
    t.equal(response.statusCode, 200)
    t.equal(response.payload, 'index:read')
  })

  t.test('override rbac check', async function (t) {
    t.plan(2)
    const response = await fastify.inject({ method: 'POST', url: '/' })
    t.equal(response.statusCode, 200)
    t.equal(response.payload, 'index:create')
  })

  t.test('skip rbac check', async function (t) {
    t.plan(2)
    const response = await fastify.inject({ method: 'PUT', url: '/' })
    t.equal(response.statusCode, 200)
    t.equal(response.payload, 'index:update')
  })
})