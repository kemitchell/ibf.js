module.exports = IBF

function IBF (options) {
  if (!this instanceof IBF) return new IBF(options)

  validateOptions(options)

  this.checkHash = options.checkHash
  this.keyHashes = options.keyHashes

  var n = this.n = options.n

  var CountView = this.CountView = options.countView
  var IdSumView = this.IdSumView = options.idSumView
  var idSumElements = this.idSumElements = options.idSumElements
  var HashSumView = this.HashSumView = options.hashSumView
  var hashSumElements = this.hashSumElements = options.hashSumElements

  // Memory Layout:
  //  [ Counts ] then
  //  [ idSums ] then
  //  [ hashSums ]

  var countsBytes = CountView.BYTES_PER_ELEMENT * n
  var idSumsBytes = IdSumView.BYTES_PER_ELEMENT * idSumElements * n
  var hashSumsBytes = HashSumView.BYTES_PER_ELEMENT * hashSumElements * n

  var arrayBuffer = new ArrayBuffer(countsBytes + idSumsBytes + hashSumsBytes)

  this.counts = new CountView(arrayBuffer, 0, n)

  var idSumsOffset = countsBytes
  this.idSums = new IdSumView(arrayBuffer, idSumsOffset, n * idSumElements)

  var hashSumsOffset = idSumsOffset + idSumsBytes
  this.hashSums = new HashSumView(arrayBuffer, hashSumsOffset, n * hashSumElements)
}

IBF.prototype.insert = function (id) { this._change(id, 1) }

IBF.prototype.remove = function (id) { this._change(id, -1) }

IBF.prototype._change = function (id, countDelta) {
  if (!isArrayBuffer(id)) throw new Error('Argument must be an ArrayBuffer')
  var checkHash = this.checkHash
  var counts = this.counts
  var idSums = this.idSums
  var idSumElements = this.idSumElements
  var hashSums = this.hashSums
  var hashSumElements = this.hashSumElements
  this.keyHashes.forEach(function (hash) {
    var key = hash(id)
    counts[key] += countDelta
    var existingId = idSums.subarray(key, key + idSumElements)
    xor(existingId, id)
    var existingHashSum = hashSums.subarray(key, key + hashSumElements)
    xor(existingHashSum, checkHash(id))
  })
}

IBF.prototype.has = function (id) {
  var counts = this.counts
  return this.keyHashes.every(function (hash) {
    return counts[hash(id)] > 0
  })
}

IBF.prototype.pure = function (key) {
  var checkHash = this.checkHash
  var hashSums = this.hashSums
  var hashSumElements = this.hashSumElements
  var idSums = this.idSums
  var idSumElements = this.idSumElements
  return this.counts.reduce(function (pure, count, offset) {
    if (count !== 1 && count !== -1) return pure
    var idSum = idSums.slice(offset, offset + idSumElements)
    var hashOfIdSum = checkHash(idSum.buffer)
    var hashSum = hashSums.subarray(offset, offset + hashSumElements)
    if (!equal(hashSum, hashOfIdSum)) return pure
    var alreadyFound = pure.some(function (element) {
      return equal(idSum, element.id)
    })
    if (alreadyFound) return pure
    return pure.concat({ positive: count === 1, id: idSum.buffer })
  }, [])
}

// Helpers

function xor (view, buffer) {
  var correspondingView = makeCorresponding(view, buffer)
  view.forEach(function (existingElement, index) {
    var correspondingElement = correspondingView[index]
    view[index] = existingElement ^ correspondingElement
  })
}

function equal (view, buffer) {
  var correspondingView = makeCorresponding(view, buffer)
  return view.every(function (element, index) {
    return element === correspondingView[index]
  })
}

function makeCorresponding (view, buffer) {
  var ViewType = view.constructor
  return new ViewType(buffer)
}

// Validation

var optionValidations = {
  n: isPositiveInteger,
  checkHash: isHash,
  keyHashes: isArrayOfHashes,
  countView: isSignedView,
  idSumView: isUnsignedView,
  idSumElements: isPositiveInteger,
  hashSumView: isUnsignedView,
  hashSumElements: isPositiveInteger
}

function validateOptions (options) {
  Object.keys(optionValidations).forEach(function (option) {
    if (!optionValidations[option](options[option])) {
      throw new Error('Invalid ' + option)
    }
  })
}

function isHash (hash) {
  return typeof hash === 'function'
}

function isArrayOfHashes (hashes) {
  return (
    Array.isArray(hashes) &&
    hashes.length !== 0 &&
    hashes.every(isHash)
  )
}

function isPositiveInteger (n) {
  return Number.isInteger(n) && n > 0
}

function isSignedView (view) {
  return (
    view === Int8Array ||
    view === Int16Array ||
    view === Int32Array
  )
}

function isUnsignedView (view) {
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
