Invertible Bloom Filter as described by Eppstein et al. in
[_What's the Difference? Efficient Set Reconciliation without Prior Context_][1].

[1]: https://www.ics.uci.edu/~eppstein/pubs/EppGooUye-SIGCOMM-11.pdf

Implemented with typed arrays.  No external dependencies. [standard][2] style.

[2]: https://www.npmjs.com/package/standard

The example in this `README` is run as the package's test suite.

## Configuration

### Initialization

```javascript
var IBF = require('ibf')
var assert = require('assert')

var cellCount = 100

var options = {
  cellCount: cellCount,

  checkHash: binaryMurmur,
  keyHashes: [singleMurmur, doubleMurmur, tripleMurmur],

  // Count hashes with 32-bit integers.
  countView: Int32Array,

  // Keys will be SHA-2 digests of 8 * 32 = 256 bits.
  idSumElements: 8,
  idSumView: Uint32Array,

  // Internal hashes will be 32-bit murmur digests.
  hashSumElements: 1,
  hashSumView: Uint32Array
}

var filter = new IBF(options)

assert.equal(filter.arrayBuffer.byteLength, 4000)
```

### Example Hash Functions

```javascript
var TextDecoder = require('text-encoding').TextDecoder
var murmur = require('murmurhash').v3

function bufferToString (buffer) {
  return new TextDecoder('utf8').decode(new Uint8Array(buffer))
}

function binaryMurmur (buffer) {
  var inputString = bufferToString(buffer)
  var digestNumber = murmur(inputString)
  var digestBuffer = new ArrayBuffer(4)
  var digestView = new Uint32Array(digestBuffer)
  digestView[0] = digestNumber
  return digestBuffer
}

function singleMurmur (buffer) {
  return murmur(bufferToString(buffer)) % cellCount
}

function doubleMurmur (buffer) {
  return murmur(
    murmur(bufferToString(buffer)).toString()
  ) % cellCount
}

function tripleMurmur (buffer) {
  return murmur(
    murmur(
      murmur(bufferToString(buffer)).toString()
    ).toString()
  ) % cellCount
}
```

## Inserting, Removing, and Querying

```javascript
var crypto = require('crypto')

var keys = {}
;['a', 'b', 'c', 'd'].forEach(function (example) {
  keys[example] = crypto.createHash('sha256')
    .update('this is ' + example)
    .digest()
    .buffer // Keys are ArrayBuffers.
})

filter.insert(keys.a)
assert(filter.has(keys.a), 'has A')
assert(filter.additional(keys.a), 'A is additional')
assert(!filter.missing(keys.a), 'A is not missing')

assert(!filter.has(keys.b), 'does not have B')
assert(!filter.additional(keys.b), 'B is not additional')
assert(!filter.missing(keys.b), 'B is not missing')

filter.insert(keys.c)
assert(filter.has(keys.c), 'has C')

filter.remove(keys.c)
assert(!filter.has(keys.c), 'no longer has C')
```

## Cloning

```javascript
var clone = filter.clone()

clone.remove(keys.d)

assert(clone.has(keys.a), 'clone has A')
assert(clone.missing(keys.d), 'clone missing D')
```

## Subtraction and Decoding

```javascript
var hasABC = new IBF(options)
hasABC.insert(keys.a)
hasABC.insert(keys.b)
hasABC.insert(keys.c)

var hasCD = new IBF(options)
hasCD.insert(keys.c)
hasCD.insert(keys.d)

var difference = hasABC.clone()
difference.subtract(hasCD)

var decoded = difference.decode()

assert(decoded !== false)

assert.equal(decoded.additional.length, 2)

function toHex (x) { return new Buffer(x).toString('hex') }

assert(decoded.additional.some(function (element) {
  return toHex(element.id) === toHex(keys.a)
}), 'additional A')

assert(decoded.additional.some(function (element) {
  return toHex(element.id) === toHex(keys.b)
}), 'additional B')

assert.equal(decoded.missing.length, 1)

assert(decoded.missing.some(function (element) {
  return toHex(element.id) === toHex(keys.d)
}), 'missing D')
```
