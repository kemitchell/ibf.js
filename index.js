module.exports = IBF

function IBF (options) {
  if (!this instanceof IBF) return new IBF(options)

  if (!validHash(options.checkHash)) throw new Error('Invalid checkHash')
  if (!validHash(options.keyHash)) throw new Error('Invalid keyHash')
  if (!validInteger(options.n)) throw new Error('Invalid n')
  if (!validInteger(options.k)) throw new Error('Invalid k')
  if (!validCountView(options.countView)) throw new Error('Invalid countView')
  if (!validIdView(options.idView)) throw new Error('Invalid idView')
  if (!validIdView(options.hashSumView)) throw new Error('Invalid hashSumView')

  var n = this.n = options.n

  this.keyHash = options.keyHash
  this.checkHash = options.checkHash

  var keyHashes = this.keyHashes = []
  var k = this.k = options.k
  for (var i = 1; i <= k; i++) {
    keyHashes.push(this.recursiveIndexHash.bind(this, i))
  }

  var CountView = this.CountView = options.countView
  var IdView = this.IdView = options.idView
  var HashSumView = this.HashSumView = options.hashSumView

  var countBytes = CountView.BYTES_PER_ELEMENT * n
  var idBytes = IdView.BYTES_PER_ELEMENT * n
  var hashSumBytes = HashSumView.BYTES_PER_ELEMENT * n

  var arrayBuffer = this.arrayBuffer = options.arrayBuffer
    ? options.arrayBuffer
    : new ArrayBuffer(countBytes + idBytes + hashSumBytes)

  this.counts = new CountView(arrayBuffer, 0, n)
  this.ids = new IdView(arrayBuffer, countBytes, n)
  this.hashSums = new IdView(arrayBuffer, countBytes, n)
}

function validHash (hash) {
  return typeof hash === 'function'
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

IBF.prototype.recursiveIndexHash = function (times, data) {
  for (var i = 0; i < times; i++) data = this.keyHash(data)
  return data % this.n
}

IBF.prototype.insert = function (id) { this._change(id, 1) }

IBF.prototype.delete = function (id) { this._change(id, -1) }

IBF.prototype._change = function (id, countDelta) {
  var self = this
  self.keyHashes.forEach(function (hash) {
    var key = hash(id)
    self.counts[key] += countDelta
    self.ids[key] = self.ids[key] ^ id
    self.hashSums[key] = self.hashSums[key] ^ self.checkHash(key)
  })
}

IBF.prototype.has = function (id) {
  var self = this
  return self.keyHashes.every(function (hash) {
    return self.counts[hash(id)] !== 0
  })
}

IBF.prototype.pure = function (key) {
  var self = this
  return this.counts.reduce(function (pure, count, offset) {
    var pureCount = count === 1 || count === -1
    var id = self.ids[offset]
    var sumsMatch = self.checkHash(id) === self.hashSums[offset]
    return (pureCount && sumsMatch)
      ? pure.concat(result(count, id))
      : pure
  }, [])
}

function result (count, id) {
  return count === 1
    ? {remaining: true, id: id}
    : {missing: true, id: id}
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
