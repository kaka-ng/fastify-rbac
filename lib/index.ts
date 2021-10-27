import * as Validator from '@kakang/validator'
import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import FastifyPlugin from 'fastify-plugin'

/**
 * if route do not have `resource`, then it allow all.
 * if route have `resource` and do not have `operation`, then it allow all `operation` with that `resources`
 * if route have both `resource` and `operation`, check if `role` allowed
 * `role` is formed by `resource:operation`
 * for example
 * - `account:read` means `account` with `read` operation
 * - `account:admin:read` means `account` with `admin:read` operation
 *
 * Advance Use
 * - route derivation should check the operation prefix and derive to different handler
 */

// Each route should be a single resources with multiple privileges
export interface RBACRouteConfig {
  rbac?: {
    // resources type
    resource: string
    // allowed operations
    operations?: string[]
    // skip checking
    skip?: boolean
    // route level rbac check
    checkRBAC?: CheckRBAC
    // key
    key: string
  }
}

export type RetrieveAccountRoles = (request: FastifyRequest, reply: FastifyReply) => string[] | Promise<string[]>
export type CheckRBAC = (routeRoles: string[], accountRoles: string[]) => boolean | Promise<boolean>

export interface FastifyRBACOptions {
  // retrieve account roles
  retrieveAccountRoles: RetrieveAccountRoles
  // instance level rbac check
  checkRBAC: CheckRBAC
  // update forbidden message
  forbiddenMessage?: string
  // additional privilege
  additionalPrivileges?: string[]
}

declare module 'fastify' {
  interface FastifyInstance {
    rbac: {
      routeRBAC: Map<string, string[]>
      roles: string[]
      hierarchy: Map<string, string[]>
    }
  }
}

export function findBestMatch (a: string[], b: string[]): string | null {
  if (!Array.isArray(a) || !Array.isArray(b)) return null
  for (let i = 0; i < a.length; i++) {
    const aArr = a[i].split(':')
    const hasRole = aArr.length >= 3
    const ares = aArr.splice(0, 1)[0]
    const arole = hasRole ? aArr.splice(0, 1)[0] : null
    const aoperation = aArr.join(':')

    for (let j = 0; j < b.length; j++) {
      const bArr = b[j].split(':')
      const hasRole = bArr.length >= 3
      const bres = bArr.splice(0, 1)[0]
      const brole = hasRole ? bArr.splice(0, 1)[0] : null
      const boperation = bArr.join(':')
      // check resource first
      const resourceMatch = (ares === '*' && bres !== null) || (bres === '*' && ares !== null) || ares === bres
      // check role
      const roleMatch = (arole === '*' && brole !== null) || (brole === '*' && arole !== null) || ((arole == null) && (brole == null)) || arole === brole
      // check operation
      const operationMatch = aoperation === '*' || boperation === '*' || aoperation === boperation
      if (resourceMatch && roleMatch && operationMatch) return a[i]
    }
  }
  if (a.includes('*') || b.includes('*')) return '*'
  return null
}

const plugin: FastifyPluginAsync<FastifyRBACOptions> = async function (fastify, options) {
  if (typeof options.retrieveAccountRoles !== 'function') throw new Error('"retrieveAccountRoles" must be function.')
  if (typeof options.checkRBAC !== 'function') throw new Error('"checkRBAC" must be function.')
  if (typeof options.forbiddenMessage !== 'string') options.forbiddenMessage = 'No Privilege'
  if (!Array.isArray(options.additionalPrivileges)) options.additionalPrivileges = []

  // prefined roles
  const roles: string[] = [...options.additionalPrivileges]
  const routeRBAC: Map<string, string[]> = new Map()
  const hierarchy: Map<string, string[]> = new Map()
  const rbac = { routeRBAC, roles, hierarchy }

  // collect all roles
  fastify.addHook('onRoute', function (routeOptions) {
    const methods = Array.isArray(routeOptions.method) ? routeOptions.method : [routeOptions.method]
    for (let i = 0; i < methods.length; i++) {
      let key = `${methods[i] as string}:${routeOptions.path}`
      if (Validator.isExist(routeOptions.constraints)) key += ` - ${JSON.stringify(routeOptions.constraints)}`
      const config = routeOptions.config as RBACRouteConfig
      if (routeRBAC.has(key)) continue
      if (!Validator.isExist(config)) continue
      if (!Validator.isExist(config.rbac)) continue
      if (!Validator.isExist(config.rbac.resource)) continue
      // store the key for future use
      config.rbac.key = key

      // find resource
      const resourceName = config.rbac.resource
      let resource = hierarchy.has(resourceName) ? hierarchy.get(resourceName) as string[] : ['*']
      // normalize operations
      const operations = Validator.isExist(config.rbac.operations) && Validator.isArray(config.rbac.operations) ? config.rbac.operations : ['*']
      // store operations in rbac hierarchy
      resource = resource.concat(operations)
      hierarchy.set(resourceName, resource)
      rbac.roles.push(`${resourceName}:*`)

      // compute roles
      const roles = operations.map((o) => { return `${resourceName}:${o}` })
      rbac.roles = rbac.roles.concat(roles)
      routeRBAC.set(key, roles)
    }
  })

  // we want to break the route handling as soon as possible
  fastify.addHook<{}, RBACRouteConfig>('onRequest', async function (this: FastifyInstance, request, reply) {
    // skip onRequest if rbac is not set
    if (!Validator.isExist(reply.context.config.rbac)) return null
    // skip when skip is true
    if (reply.context.config.rbac.skip === true) return null
    if (!Validator.isExist(reply.context.config.rbac.resource)) return null
    const key = reply.context.config.rbac.key ?? `${request.method}:${request.routerPath}`
    const routeRoles = routeRBAC.get(key)
    // skip when no roles is specified
    if (!Validator.isExist(routeRoles)) return null
    const accountRoles = await options.retrieveAccountRoles.call(this, request, reply)
    const checkRBAC = reply.context.config.rbac.checkRBAC ?? options.checkRBAC
    const passed = await checkRBAC.call(this, routeRoles, accountRoles)
    if (!passed) {
      const err: Error & { statusCode?: number } = new Error(options.forbiddenMessage)
      err.statusCode = 403
      throw err
    }
    return null
  })

  fastify.addHook('onReady', async function () {
    // dedup rbac roles
    rbac.roles = Array.from(new Set(rbac.roles))
    rbac.hierarchy.forEach(function (value, key) {
      rbac.hierarchy.set(key, Array.from(new Set(value)))
    })
  })

  fastify.decorate('rbac', rbac)
}

export const FastifyRBAC = FastifyPlugin(plugin, {
  fastify: '3.x',
  name: 'fastify-rbac',
  dependencies: []
})
export default FastifyRBAC
