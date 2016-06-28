var TextDecoder = require('text-encoding').TextDecoder
var assert = require('assert')
var IBF = require('./')
var murmur = require('murmurhash').v3
var crypto = require('crypto')
var base64 = require('base64-arraybuffer').encode

var n = 100

var idElements = 8
var hashSumElements = 1

function bufferToString (buffer) {
  return new TextDecoder('utf8').decode(new Uint8Array(buffer))
}

var filter = new IBF({
  n: n,
  hashCount: 3,
  checkHash: function binaryMurmur (buffer) {
    var inputString = bufferToString(buffer)
    var digestNumber = murmur(inputString)
    var digestBuffer = new ArrayBuffer(4)
    var digestView = new Uint32Array(digestBuffer)
    digestView[0] = digestNumber
    return digestBuffer
  },
  keyHashes: [
    function (buffer) {
      console.log('hash 1')
      return murmur(bufferToString(buffer)) % n
    },
    function (buffer) {
      console.log('hash 2')
      return murmur(
        murmur(bufferToString(buffer)).toString()
      ) % n
    },
    function (buffer) {
      console.log('hash 3')
      return murmur(
        murmur(
          murmur(bufferToString(buffer)).toString()
        ).toString()
      ) % n
    }
  ],
  countView: Int32Array,
  idView: Uint32Array,
  idElements: idElements,
  hashSumView: Uint32Array,
  hashSumElements: hashSumElements
})

function hashContent (content) {
  return crypto.createHash('sha256')
    .update(content)
    .digest()
}

var contentA = 'this is a'
var contentB = 'this is b'
var contentC = 'this is c'

var digestA = hashContent(contentA)
var digestB = hashContent(contentB)
var digestC = hashContent(contentC)

console.log('a is %j', digestA.toString('base64'))
console.log('b is %j', digestB.toString('base64'))
console.log('c is %j', digestC.toString('base64'))

filter.insert(digestA.buffer)
assert(filter.has(digestA.buffer))

for (var i = 0; i < n; i++) {
  var id = base64(filter.ids.subarray(i, idElements))
  var hash = base64(filter.hashSums.subarray(i, 1))
  if (filter.counts[i] !== 0) {
    console.log('%s is %d', 'count', filter.counts[i])
    console.log('%s is %j', 'idSum', id)
    console.log('%s is %j', 'hashSum', hash)
  }
}

assert(!filter.has(digestB.buffer))

assert.deepEqual(filter.pure(), [{positive: true, id: digestA}])

filter.insert(digestC.buffer)
assert(filter.has(digestA.buffer))
filter.remove(digestC.buffer)
assert(!filter.has(digestA.buffer))
