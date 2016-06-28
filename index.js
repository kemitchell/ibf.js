module.exports = IBF

function IBF (options) {
  if (!this instanceof IBF) return new IBF(options)

  if (!validHashes(options.hashes)) throw new Error('Invalid hashes')
  if (!validM(options.m)) throw new Error('Invalid m')
  if (!validCountView(options.countView)) throw new Error('Invalid countView')
  if (!validIdView(options.idView)) throw new Error('Invalid idView')

  this.hashes = options.hashes
  var m = this.m = options.m

  var CountView = this.CountView = options.countView
  var IdView = this.IdView = options.IdView
  var countBytes = CountView.BYTES_PER_ELEMENT * m
  var idBytes = IdView.BYTES_PER_ELEMENT * m
  var arrayBuffer = this.arrayBuffer = options.arrayBuffer
    ? options.arrayBuffer
    : new ArrayBuffer(countBytes + idBytes)
  this.counts = new CountView(arrayBuffer, 0, m)
  this.ids = new IdView(arrayBuffer, countBytes, m)
}

function validHashes (hashes) {
  return Array.isArray(hashes) &&
    hashes.length !== 0 &&
    hashes.every(function (element) {
      return typeof element === 'function'
    })
}

function validM (m) {
  return Number.isInteger(m) && m > 0
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

IBF.prototype.insert = function (key) {
  var self = this
  self.hashes.forEach(function (hash) {
    var digest = hash(key)
    self.counts[digest] += 1
    self.ids[digest] = self.ids[digest] ^ digest
  })
}

IBF.prototype.delete = function (key) {
  var self = this
  self.hashes.forEach(function (hash) {
    var digest = hash(key)
    self.counts[digest] -= 1
    self.ids[digest] = self.ids[digest] ^ digest
  })
}

IBF.prototype.includes = function (key) {
  var self = this
  return self.hashes.every(function (hash) {
    var digest = hash(key)
    var count = self.counts[digest]
    return count !== 0
  })
}

IBF.prototype.pure = function (key) {
  var self = this
  return this.counts.reduce(function (pure, count, offset) {
    return count === 0
      ? pure.concat(self.ids[offset])
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
