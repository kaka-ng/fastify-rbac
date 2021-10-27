import { CheckRBAC, RetrieveAccountRoles } from '../lib'

export const retrieveAccountRoles: RetrieveAccountRoles = function (t) {
  return ['index:read', 'dynamic:read']
}

export const checkRBAC: CheckRBAC = function (routeRoles, accountRoles) {
  // if either one match all exist, no need to check
  if (accountRoles.includes('*') || routeRoles.includes('*')) return true
  for (let i = accountRoles.length - 1; i >= 0; i--) {
    const accountRole = accountRoles[i].split(':')
    for (let j = routeRoles.length - 1; j >= 0; j--) {
      const routeRole = routeRoles[j].split(':')
      const routeRoleResouce = routeRole.splice(0, 1)[0]
      const accountRoleResouce = accountRole.splice(0, 1)[0]
      const routeRoleOperation = routeRole.join(':')
      const accountRoleOperation = accountRole.join(':')
      // check resource first
      const resourceMatch = routeRoleResouce === '*' || accountRoleResouce === '*' || routeRoleResouce === accountRoleResouce
      // check operation
      const operationMatch = routeRoleOperation === '*' || accountRoleOperation === '*' || routeRoleOperation === accountRoleOperation
      if (resourceMatch && operationMatch) return true
    }
  }
  return false
}
