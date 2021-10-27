import t from 'tap'
import { findBestMatch } from '../lib'

t.plan(1)
t.test('findBestMatch', function (t) {
  t.plan(6)
  t.test('no match', function (t) {
    t.plan(1)
    const result = findBestMatch([], [])
    t.equal(result, null)
  })

  t.test('* should match', function (t) {
    t.plan(1)
    const result = findBestMatch(['account:admin:read', 'account:read'], ['*'])
    t.equal(result, '*')
  })

  t.test('*:* should match', function (t) {
    t.plan(1)
    const result = findBestMatch(['account:admin:read', 'account:read'], ['*:*'])
    t.equal(result, 'account:read')
  })

  t.test('*:*:* should match', function (t) {
    t.plan(1)
    const result = findBestMatch(['account:admin:read', 'account:read'], ['*:*:*'])
    t.equal(result, 'account:admin:read')
  })

  t.test('account:admin:read', function (t) {
    t.plan(1)
    const result = findBestMatch(['account:admin:read', 'account:read'], ['account:admin:read'])
    t.equal(result, 'account:admin:read')
  })

  t.test('FIFO', function (t) {
    t.plan(1)
    const result = findBestMatch(['account:admin:read', 'account:read'], ['account:read', 'account:admin:read'])
    t.equal(result, 'account:admin:read')
  })
})
