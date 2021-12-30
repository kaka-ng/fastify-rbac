import t from 'tap'
import { findBestMatch } from '../lib'

t.plan(1)
t.test('findBestMatch', function (t) {
  t.plan(7)
  t.test('no match', function (t) {
    t.plan(1)
    const result = findBestMatch([], [])
    t.equal(result, null)
  })

  t.test('* should not match', function (t) {
    t.plan(1)
    const result = findBestMatch(['account:admin:read', 'account:read'], ['*'])
    t.equal(result, null)
  })

  t.test('*:* should match', function (t) {
    t.plan(2)
    const result = findBestMatch(['account:admin:read', 'account:read'], ['*:*'])
    t.equal(result?.supported, 'account:read')
    t.equal(result?.owned, '*:*')
  })

  t.test('*:*:* should match', function (t) {
    t.plan(2)
    const result = findBestMatch(['account:admin:read', 'account:read'], ['*:*:*'])
    t.equal(result?.supported, 'account:admin:read')
    t.equal(result?.owned, '*:*:*')
  })

  t.test('*:*:* should match account:read', function (t) {
    t.plan(2)
    const result = findBestMatch(['account:read'], ['*:*:*'])
    t.equal(result?.supported, 'account:read')
    t.equal(result?.owned, '*:*:*')
  })

  t.test('account:admin:read', function (t) {
    t.plan(2)
    const result = findBestMatch(['account:admin:read', 'account:read'], ['account:admin:read'])
    t.equal(result?.supported, 'account:admin:read')
    t.equal(result?.owned, 'account:admin:read')
  })

  t.test('detail row should match first', function (t) {
    t.plan(4)
    let result
    result = findBestMatch(['account:admin:read', 'account:read'], ['account:read', 'account:admin:read'])
    t.equal(result?.supported, 'account:admin:read')
    t.equal(result?.owned, 'account:admin:read')

    result = findBestMatch(['account:read', 'account:admin:read'], ['account:read', 'account:admin:read'])
    t.equal(result?.supported, 'account:admin:read')
    t.equal(result?.owned, 'account:admin:read')
  })
})
