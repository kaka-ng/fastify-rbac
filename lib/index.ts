import * as Validator from '@kakang/validator'
import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest, RouteOptions } from 'fastify'
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
export type ComputeConstraints = (routeOptions: RouteOptions) => { [key: string]: any }

export interface FastifyRBACOptions {
  // retrieve account roles
  retrieveAccountRoles: RetrieveAccountRoles
  // instance level rbac check
  checkRBAC: CheckRBAC
  // update forbidden message
  forbiddenMessage?: string
  // additional privilege
  additionalPrivileges?: string[]
  // compute key based on constraint
  computeConstraints?: ComputeConstraints
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

export interface RBAC { resource: string, role: string, operation: string }
export function sto (s: string): RBAC {
  const arr = s.split(':')
  const hasRole = arr.length >= 3
  return {
    resource: arr.splice(0, 1)[0],
    role: hasRole ? arr.splice(0, 1)[0] : 'null',
    operation: arr.join(':')
  }
}

// supported means the resource support which role
// owned means you have which role
//
// This function used to find the best match owned
// to match the supported list
export function findBestMatch (supported: string[], owned: string[]): { supported: string, owned: string, weight: number } | null {
  const stack: Array<{ supported: string, owned: string, weight: number }> = []
  // at least weight 3 before pushing inside stack
  for (let i = 0; i < supported.length; i++) {
    const a = sto(supported[i])
    for (let j = 0; j < owned.length; j++) {
      const b = sto(owned[j])
      const resource = isMatch(a.resource, b.resource)
      const role = isMatch(a.role, b.role, false)
      const operation = isMatch(a.operation, b.operation)
      const weight = 9 - (resource.asterisk + resource.null + role.asterisk + role.null + operation.asterisk + operation.null)
      if (resource.match && role.match && operation.match) {
        stack.push({ supported: supported[i], owned: owned[j], weight })
      }
    }
  }
  const result = stack.sort((a, b) => b.weight - a.weight).shift()
  return result ?? null
}

function isMatch (a: string, b: string, nonNull: boolean = true): { match: boolean, asterisk: number, null: number } {
  const match = a === b || (a === '*' && b !== 'null') || (b === '*' && a !== 'null') || (a === '*' && b === 'null' && !nonNull) || (b === '*' && a === 'null' && !nonNull)
  const asterisk = a === '*' && b === '*' ? 2 : a === '*' || b === '*' ? 1 : 0
  const nul = a === 'null' && b === 'null' ? 2 : a === 'null' || b === 'null' ? 1 : 0
  return { match, asterisk, null: nul }
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
    // we before looping
    const config = routeOptions.config as RBACRouteConfig
    if (!Validator.isExist(config)) return
    if (!Validator.isExist(config.rbac)) return
    if (!Validator.isExist(config.rbac.resource)) return

    const methods = Array.isArray(routeOptions.method) ? routeOptions.method : [routeOptions.method]
    if (typeof options.computeConstraints === 'function') {
      routeOptions.constraints = Object.assign({}, routeOptions.constraints, options.computeConstraints(routeOptions))
    }
    for (let i = 0; i < methods.length; i++) {
      let key = `${methods[i] as string}:${routeOptions.path}`
      if (Validator.isExist(routeOptions.constraints)) key += ` - ${JSON.stringify(routeOptions.constraints)}`
      if (routeRBAC.has(key)) continue
      // store the key for future use
      config.rbac.key = key

      // find resource
      const resourceName = config.rbac.resource
      let resource = hierarchy.has(resourceName) ? hierarchy.get(resourceName) as string[] : []
      // normalize operations
      const operations = Validator.isExist(config.rbac.operations) && Validator.isArray(config.rbac.operations) ? config.rbac.operations : []
      // store operations in rbac hierarchy
      resource = resource.concat(operations)
      hierarchy.set(resourceName, resource)

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
  fastify: '4.x',
  name: '@kakang/fastify-rbac',
  dependencies: []
})
export default FastifyRBAC
