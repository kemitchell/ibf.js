var assert = require('assert')

module.exports = IBF

function IBF (options) {
  if (!this instanceof IBF) return new IBF(options)

  var idElements = options.idElements || 1
  var hashSumElements = options.hashSumElements || 1

  if (!validHash(options.checkHash)) throw new Error('Invalid checkHash')
  if (!validHashes(options.keyHashes)) throw new Error('Invalid keyHashes')
  if (!validInteger(options.n)) throw new Error('Invalid n')
  if (!validInteger(idElements)) throw new Error('Invalid idElements')
  if (!validInteger(hashSumElements)) throw new Error('Invalid hashSumElements')
  if (!validInteger(options.hashCount)) throw new Error('Invalid hashCount')
  if (!validCountView(options.countView)) throw new Error('Invalid countView')
  if (!validIdView(options.idView)) throw new Error('Invalid idView')
  if (!validIdView(options.hashSumView)) throw new Error('Invalid hashSumView')

  this.checkHash = options.checkHash
  this.keyHashes = options.keyHashes

  var n = this.n = options.n

  var CountView = this.CountView = options.countView
  var IdView = this.IdView = options.idView
  this.idElements = idElements
  var HashSumView = this.HashSumView = options.hashSumView
  this.hashSumElements = hashSumElements

  var countBytes = CountView.BYTES_PER_ELEMENT * n
  var idBytes = IdView.BYTES_PER_ELEMENT * n * idElements
  var hashSumBytes = HashSumView.BYTES_PER_ELEMENT * n * hashSumElements

  var arrayBuffer = this.arrayBuffer = options.arrayBuffer
    ? options.arrayBuffer
    : new ArrayBuffer(countBytes + idBytes + hashSumBytes)

  this.counts = new CountView(arrayBuffer, 0, n)
  var idsOffset = countBytes
  this.ids = new IdView(arrayBuffer, idsOffset, n * idElements)
  var hashSumsOffset = idsOffset + idBytes
  this.hashSums = new IdView(arrayBuffer, hashSumsOffset, n * hashSumElements)
}

IBF.prototype.insert = function (id) { this._change(id, 1) }

IBF.prototype.remove = function (id) { this._change(id, -1) }

IBF.prototype._change = function (id, countDelta) {
  if (!isArrayBuffer(id)) throw new Error('Argument must be an ArrayBuffer')
  var n = this.n
  var checkHash = this.checkHash
  var counts = this.counts
  var ids = this.ids
  var idElements = this.idElements
  var hashSums = this.hashSums
  var hashSumElements = this.hashSumElements
  this.keyHashes.forEach(function (hash) {
    var key = hash(id)
    assert(typeof key === 'number', 'key is number')
    assert(key < n, 'key is number')
    counts[key] += countDelta
    var existingId = ids.subarray(key, key + idElements)
    xor(existingId, id)
    var existingHashSum = hashSums.subarray(key, key + hashSumElements)
    xor(existingHashSum, checkHash(key))
  })
}

function xor (existingView, withBuffer) {
  console.log('%s is %j', 'existing.byteLength', existingView.byteLength)
  var ViewType = existingView.constructor
  var correspondingView = new ViewType(withBuffer)
  console.log('%s is %j', 'corresponding.byteLength', correspondingView.byteLength)
  existingView.forEach(function (existingElement, index) {
    var correspondingElement = correspondingView[index]
    existingView[index] = existingElement ^ correspondingElement
  })
}

IBF.prototype.has = function (id) {
  var counts = this.counts
  return this.keyHashes.every(function (hash) {
    var key = hash(id)
    return counts[key] !== 0
  })
}

IBF.prototype.pure = function (key) {
  var self = this
  return this.counts.reduce(function (pure, count, offset) {
    var pureCount = count === 1 || count === -1
    var id = self.ids[offset]
    var sumsMatch = self.checkHash(id) === self.hashSums[offset]
    return (pureCount && sumsMatch)
      ? pure.concat({ positive: count === 1, id: id })
      : pure
  }, [])
}

IBF.prototype.clone = function () {
  return new IBF({
    hashes: this.hashes,
    m: this.m,
    countView: this.CountView,
    idView: this.IdView,
    arrayBuffer: this.arrayBuffer.slice()
  })
}

// Validation

function validHash (hash) {
  return typeof hash === 'function'
}

function validHashes (hashes) {
  return Array.isArray(hashes) && hashes.length !== 0 && hashes.every(validHash)
}

function validInteger (n) {
  return Number.isInteger(n) && n > 0
}

function validCountView (view) {
  return (
    view === Int8Array ||
    view === Int16Array ||
    view === Int32Array
  )
}

function validIdView (view) {
  return (
    view === Uint8Array ||
    view === Uint8ClampedArray ||
    view === Uint16Array ||
    view === Uint32Array
  )
}

function isArrayBuffer (id) {
  return id instanceof ArrayBuffer
}
