import Fastify, { FastifyInstance } from 'fastify'
import t from 'tap'
import FastifyRBAC from '../lib'
import { checkRBAC, retrieveAccountRoles } from './util'

t.plan(1)
t.test('instance rbac', async function (t) {
  t.plan(7)
  const fastify: FastifyInstance = Fastify()
  await fastify.register(FastifyRBAC, { retrieveAccountRoles, checkRBAC })
  fastify.get('/', { config: { rbac: { resource: 'index', operations: ['read'] } } }, async function (t) { return 'index:read' })
  fastify.post('/', { config: { rbac: { resource: 'index', operations: ['create'] } } }, async function (t) { return 'index:create' })
  fastify.put('/', { config: {} }, async function (t) { return 'index:update' })
  fastify.delete('/', { config: { rbac: { resource: null } } }, async function (t) { return 'index:update' })
  fastify.route({ method: ['GET', 'PUT'], url: '/:id', config: { rbac: { resource: 'dynamic', operations: ['*'] } }, async handler () { return 'dynamic:*' } })
  await fastify.ready()

  t.test('fastify.rbac', function (t) {
    t.plan(2)
    t.equal(fastify.rbac.roles.length, 3)
    t.same(Array.from(fastify.rbac.routeRBAC.keys()), ['GET:/', 'POST:/', 'GET:/:id', 'PUT:/:id', 'HEAD:/'])
  })

  t.test('match rbac', async function (t) {
    t.plan(2)
    const response = await fastify.inject({ method: 'GET', url: '/' })
    t.equal(response.statusCode, 200)
    t.equal(response.payload, 'index:read')
  })

  t.test('incorrect rbac', async function (t) {
    t.plan(2)
    const response = await fastify.inject({ method: 'POST', url: '/' })
    t.equal(response.statusCode, 403)
    t.equal(response.payload, '{"statusCode":403,"error":"Forbidden","message":"No Privilege"}')
  })

  t.test('no rbac', async function (t) {
    t.plan(2)
    const response = await fastify.inject({ method: 'PUT', url: '/' })
    t.equal(response.statusCode, 200)
    t.equal(response.payload, 'index:update')
  })

  t.test('no rbac', async function (t) {
    t.plan(2)
    const response = await fastify.inject({ method: 'DELETE', url: '/' })
    t.equal(response.statusCode, 200)
    t.equal(response.payload, 'index:update')
  })

  t.test('dynamic params', async function (t) {
    t.plan(2)
    const response = await fastify.inject({ method: 'GET', url: '/hello' })
    t.equal(response.statusCode, 200)
    t.equal(response.payload, 'dynamic:*')
  })

  t.test('cleared rbac', async function (t) {
    t.plan(2)
    fastify.rbac.routeRBAC.clear()
    const response = await fastify.inject({ method: 'POST', url: '/' })
    t.equal(response.statusCode, 200)
    t.equal(response.payload, 'index:create')
  })
})
