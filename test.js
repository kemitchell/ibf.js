var assert = require('assert')
var IBF = require('./')
var murmur = require('murmurhash').v3

var n = 10

var filter = new IBF({
  n: n,
  k: 3,
  checkHash: murmur,
  keyHash: murmur,
  countView: Int16Array,
  idView: Uint32Array,
  hashSumView: Uint32Array
})

filter.insert('a')
assert(filter.has('a'))
assert(!filter.has('b'))

filter.delete('b')
