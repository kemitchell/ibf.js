Invertible Bloom Filter as described by Eppstein et al. in
[_What's the Difference? Efficient Set Reconciliation without Prior Context_][1].

[1]: https://www.ics.uci.edu/~eppstein/pubs/EppGooUye-SIGCOMM-11.pdf

Implemented with typed arrays.  No external dependencies. [standard][2] style.

[2]: https://www.npmjs.com/package/standard

The example in this `README` is run as the package's test suite.

## Configuration

```javascript
var IBF = require('./')
var TextDecoder = require('text-encoding').TextDecoder
var murmur = require('murmurhash').v3

var n = 1000

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

  // Count hashes with 32-bit integers.
  countView: Int32Array,

  // Keys will be SHA-2 digests of 8 * 32 = 256 bits.
  idSumElements: 8,
  idSumView: Uint32Array,

  // Internal hashes will be 32-bit murmur digests.
  hashSumElements: 1,
  hashSumView: Uint32Array
})
```

## Inserting & Querying

```javascript
var assert = require('assert')
var crypto = require('crypto')

var keys = {}
;['a', 'b', 'c', 'd'].forEach(function (example) {
  keys[example] = crypto.createHash('sha256')
    .update('this is ' + example)
    .digest()
    .buffer
})

filter.insert(keys.a)
assert(filter.has(keys.a), 'has A')
assert(!filter.has(keys.b), 'does not have B')
```

## Removing

```javascript
filter.insert(keys.c)
assert(filter.has(keys.c), 'has C')
filter.remove(keys.c)
assert(!filter.has(keys.c), 'no longer has C')
```

## Pure Checking

```javascript
filter.remove(keys.d)
var pure = filter.pure()

assert(pure.some(function (element) {
  return element.positive === true &&
    toHexString(element.id) == toHexString(keys.a)
}), 'shows has A')

assert(pure.some(function (element) {
  return element.positive === false &&
    toHexString(element.id) == toHexString(keys.d)
}), 'shows missing D')

function toHexString (buffer) {
  return new Buffer(buffer).toString('hex')
}
```
