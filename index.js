module.exports = IBF

function IBF (options) {
  if (!(this instanceof IBF)) {
    return new IBF(options)
  }

  validateOptions(options)

  this.checkHash = options.checkHash
  this.keyHashes = options.keyHashes

  var cellCount = this.cellCount = options.cellCount

  var CountView = this.CountView = options.countView
  var countsBytes = CountView.BYTES_PER_ELEMENT * cellCount

  var IdSumView = this.IdSumView = options.idSumView
  var idSumElements = this.idSumElements = options.idSumElements
  var idSumsBytes = (
    IdSumView.BYTES_PER_ELEMENT * idSumElements * cellCount
  )

  var HashSumView = this.HashSumView = options.hashSumView
  var hashSumElements = this.hashSumElements = options.hashSumElements
  var hashSumsBytes = (
    HashSumView.BYTES_PER_ELEMENT * hashSumElements * cellCount
  )

  var byteLength = countsBytes + idSumsBytes + hashSumsBytes

  var arrayBuffer
  if (options.arrayBuffer) {
    arrayBuffer = options.arrayBuffer
    /* istanbul ignore if */
    if (arrayBuffer.byteLength !== byteLength) {
      throw new Error('Wrong size arrayBuffer')
    }
  } else {
    arrayBuffer = new ArrayBuffer(byteLength)
  }
  this.arrayBuffer = arrayBuffer

  var offset = 0
  this.counts = new CountView(arrayBuffer, offset, cellCount)

  offset += countsBytes
  this.idSums = new IdSumView(
    arrayBuffer, offset, cellCount * idSumElements
  )

  offset += idSumsBytes
  this.hashSums = new HashSumView(
    arrayBuffer, offset, cellCount * hashSumElements
  )
}

IBF.prototype.clone = function () {
  return new IBF({
    checkHash: this.checkHash,
    keyHashes: this.keyHashes,
    cellCount: this.cellCount,
    countView: this.CountView,
    idSumView: this.IdSumView,
    idSumElements: this.idSumElements,
    hashSumView: this.HashSumView,
    hashSumElements: this.hashSumElements,
    arrayBuffer: this.arrayBuffer.slice(0)
  })
}

IBF.prototype.insert = function (id) {
  change(this, id, 1)
}

IBF.prototype.remove = function (id) {
  change(this, id, -1)
}

function change (filter, id, deltaCount) {
  /* istanbul ignore if */
  if (!isArrayBuffer(id)) {
    throw new Error('Argument must be an ArrayBuffer')
  }
  var checkHash = filter.checkHash
  filter.keyHashes.forEach(function (hash) {
    changeAtIndex(filter, hash(id), id, checkHash(id), deltaCount)
  })
}

function changeAtIndex (filter, index, id, hash, deltaCount) {
  filter.counts[index] += deltaCount
  var existingId = filter.idSums.subarray(
    index, index + filter.idSumElements
  )
  xor(existingId, id)
  var existingHashSum = filter.hashSums.subarray(
    index, index + filter.hashSumElements
  )
  xor(existingHashSum, hash)
}

IBF.prototype.has = function (id) {
  return everyHash(this, id, function (count) {
    return count !== 0
  })
}

IBF.prototype.additional = function (id) {
  return everyHash(this, id, function (count) {
    return count > 0
  })
}

IBF.prototype.missing = function (id) {
  return everyHash(this, id, function (count) {
    return count < 0
  })
}

function everyHash (filter, id, predicate) {
  var counts = filter.counts
  return filter.keyHashes.every(function (hash) {
    return predicate(counts[hash(id)])
  })
}

IBF.prototype.subtract = function (otherIBF) {
  var thisIBF = this
  var cellCount = thisIBF.cellCount
  /* istanbul ignore if */
  if (cellCount !== otherIBF.cellCount) {
    throw new Error('Different cellCount values')
  }
  otherIBF.counts.forEach(function (count, index) {
    if (count === 0) {
      return
    }
    var id = idSumOf(otherIBF, index).slice().buffer
    var hash = thisIBF.checkHash(id)
    changeAtIndex(thisIBF, index, id, hash, -count)
  })
}

IBF.prototype.decode = function () {
  var self = this
  var additional = []
  var missing = []

  var cellCount = this.cellCount

  var pureList = findPureCells()
  while (pureList.length !== 0) {
    pureList.forEach(function (pureIndex) {
      if (!isPure(self, pureIndex)) {
        return
      }
      var id = idSumOf(self, pureIndex).slice().buffer
      var count = self.counts[pureIndex]
      if (count === 1) {
        additional.push({id: id})
        self.remove(id)
      } else {
        missing.push({id: id})
        self.insert(id)
      }
    })
    pureList = findPureCells()
  }

  function findPureCells () {
    var pures = []
    var length = self.counts.length
    for (var index = 0; index < length; index++) {
      if (isPure(self, index)) {
        pures.push(index)
      }
    }
    return pures
  }

  for (var index = 0; index < cellCount; index++) {
    if (self.counts[index] !== 0) {
      return false
    }
    if (!isZero(idSumOf(self, index))) {
      return false
    }
    if (!isZero(hashSumOf(self, index))) {
      return false
    }
  }

  return {
    additional: additional,
    missing: missing
  }
}

function isPure (filter, index) {
  var count = filter.counts[index]
  if (count !== 1 && count !== -1) {
    return false
  }
  var idSum = idSumOf(filter, index).slice().buffer
  var hashOfIdSum = filter.checkHash(idSum)
  var hashSum = hashSumOf(filter, index)
  if (!equal(hashSum, hashOfIdSum)) {
    return false
  }
  return true
}

// Helpers

function idSumOf (filter, index) {
  return filter.idSums.subarray(index, index + filter.idSumElements)
}

function hashSumOf (filter, index, copy) {
  return filter.hashSums.subarray(index, index + filter.hashSumElements)
}

function isZero (view) {
  return view.every(function (element) {
    return element === 0
  })
}

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
  cellCount: isPositiveInteger,
  arrayBuffer: optional(isArrayBuffer),
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

function optional (cb) {
  return function (value) {
    return value === undefined || cb(value)
  }
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
