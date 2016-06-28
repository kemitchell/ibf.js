Invertible Bloom Filter as described by Eppstein et al. in
[_What's the Difference? Efficient Set Reconciliation without Prior Context_][1].

[1]: https://www.ics.uci.edu/~eppstein/pubs/EppGooUye-SIGCOMM-11.pdf

Implemented with typed arrays.  No external dependencies. [standard][2] style.

[2]: https://www.npmjs.com/package/standard

The example in this `README` is run as the package's test suite.

## Configuration

### Hash Functions

```javascript
var TextDecoder = require('text-encoding').TextDecoder
var murmur = require('murmurhash').v3

var n = 1000

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
  return murmur(bufferToString(buffer)) % n
}

function doubleMurmur (buffer) {
  return murmur(
    murmur(bufferToString(buffer)).toString()
  ) % n
}

function tripleMurmur (buffer) {
  return murmur(
    murmur(
      murmur(bufferToString(buffer)).toString()
    ).toString()
  ) % n
}
```

### Initialization

```javascript
var IBF = require('ibf')

var options = {
  n: n,

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
```

## Inserting, Removing, and Querying

```javascript
var assert = require('assert')
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

## Pure Checking

```javascript
filter.remove(keys.d)
assert(filter.has(keys.d), 'has D')
assert(filter.missing(keys.d), 'missing D')

var pure = filter.pure()

assert.equal(pure.length, 2)

assert(pure.some(function (element) {
  return element.additional && toHex(element.id) == toHex(keys.a)
}), 'shows has A')

assert(pure.some(function (element) {
  return element.missing && toHex(element.id) == toHex(keys.d)
}), 'shows missing D')

function toHex (buffer) {
  return new Buffer(buffer).toString('hex')
}
```

## Cloning

```javascript
options.arrayBuffer = filter.arrayBuffer.slice()
var clone = new IBF(options)

assert(clone.has(keys.a), 'clone has A')
assert(clone.missing(keys.d), 'clone missing D')
```
