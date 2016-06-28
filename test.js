var IBF = require('./')
var TextDecoder = require('text-encoding').TextDecoder
var assert = require('assert')
var crypto = require('crypto')
var murmur = require('murmurhash').v3

var n = 100

var idElements = 8
var hashSumElements = 1

function bufferToString (buffer) {
  return new TextDecoder('utf8').decode(new Uint8Array(buffer))
}

var filter = new IBF({
  n: n,
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
      return murmur(bufferToString(buffer)) % n
    },
    function (buffer) {
      return murmur(
        murmur(bufferToString(buffer)).toString()
      ) % n
    },
    function (buffer) {
      return murmur(
        murmur(
          murmur(bufferToString(buffer)).toString()
        ).toString()
      ) % n
    }
  ],
  countView: Int32Array,
  idSumView: Uint32Array,
  idSumElements: idElements,
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

filter.insert(digestA.buffer)
assert(filter.has(digestA.buffer), 'has A')

assert(!filter.has(digestB.buffer), 'does not have B')

assert.deepEqual(
  filter.pure(), [{positive: true, id: digestA.buffer}],
  'A is positive-pure')

filter.insert(digestC.buffer)
assert(filter.has(digestC.buffer), 'has C')
filter.remove(digestC.buffer)
assert(!filter.has(digestC.buffer), 'no longer has C')
