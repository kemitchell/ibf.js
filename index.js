module.exports = IBF

function IBF (options) {
  if (!(this instanceof IBF)) {
    return new IBF(options)
  }

  validateOptions(options)

  this.checkHash = options.checkHash
  this.keyHashes = options.keyHashes

  var cellCount = this.cellCount = options.cellCount

  var CountView = this.CountView = Int32Array
  var countsBytes = CountView.BYTES_PER_ELEMENT * cellCount

  var IdSumView = this.IdSumView = Uint8Array
  var idSumOctets = this.idSumOctets = options.idSumOctets
  var idSumsBytes = (
    IdSumView.BYTES_PER_ELEMENT * idSumOctets * cellCount
  )

  var HashSumView = this.HashSumView = Uint8Array
  var hashSumOctets = this.hashSumOctets = options.hashSumOctets
  var hashSumsBytes = (
    HashSumView.BYTES_PER_ELEMENT * hashSumOctets * cellCount
  )

  var byteLength = countsBytes + idSumsBytes + hashSumsBytes

  var arrayBuffer
  if (options.arrayBuffer) {
    /* istanbul ignore if */
    if (options.arrayBuffer.byteLength !== byteLength) {
      throw new Error(
        'Wrong size arrayBuffer. ' +
        'Expected ' + byteLength + ' bytes. ' +
        'Received ' + arrayBuffer.byteLength + ' bytes.'
      )
    }
    arrayBuffer = options.arrayBuffer
  } else {
    arrayBuffer = new ArrayBuffer(byteLength)
  }
  this.arrayBuffer = arrayBuffer

  var offset = 0
  this.counts = new CountView(arrayBuffer, offset, cellCount)

  offset += countsBytes
  this.idSums = new IdSumView(
    arrayBuffer, offset, cellCount * idSumOctets
  )

  offset += idSumsBytes
  this.hashSums = new HashSumView(
    arrayBuffer, offset, cellCount * hashSumOctets
  )
}

IBF.prototype.clone = function () {
  return new IBF({
    checkHash: this.checkHash,
    keyHashes: this.keyHashes,
    cellCount: this.cellCount,
    idSumOctets: this.idSumOctets,
    hashSumOctets: this.hashSumOctets,
    arrayBuffer: this.arrayBuffer.slice()
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
  var checkDigest = filter.checkHash(id)
  filter.keyHashes.forEach(function (hash) {
    changeAtIndex(filter, hash(id), id, checkDigest, deltaCount)
  })
}

function changeAtIndex (filter, index, id, hash, deltaCount) {
  filter.counts[index] += deltaCount
  xor(idSumOf(filter, index), id)
  xor(hashSumOf(filter, index), hash)
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
  /* istanbul ignore if */
  if (thisIBF.cellCount !== otherIBF.cellCount) {
    throw new Error('Different cellCount values')
  }
  otherIBF.counts.forEach(function (count, index) {
    var idSum = idSumOf(otherIBF, index)
    var hashSum = hashSumOf(otherIBF, index)
    changeAtIndex(thisIBF, index, idSum, hashSum, -count)
  })
}

function copyOfId (filter, view) {
  var returned = new ArrayBuffer(
    filter.IdSumView.BYTES_PER_ELEMENT * filter.idSumOctets
  )
  new Uint8Array(returned).set(new Uint8Array(view))
  return returned
}

// TODO Throw informative errors instead of returning false.

IBF.prototype.decode = function () {
  var self = this
  var additional = []
  var missing = []

  var cellCount = this.cellCount

  var pureList = findPureCells()
  while (pureList.length !== 0) {
    pureList.forEach(function (pureIndex) {
      /* istanbul ignore if */
      if (!isPure(self, pureIndex)) {
        return
      }
      var id = copyOfId(self, idSumOf(self, pureIndex))
      var count = self.counts[pureIndex]
      if (count === 1) {
        additional.push({id: id})
        self.remove(id)
      } else if (count === -1) {
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
    /* istanbul ignore if */
    if (self.counts[index] !== 0) {
      return false
    }
    /* istanbul ignore if */
    if (!isZero(idSumOf(self, index))) {
      return false
    }
    /* istanbul ignore if */
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
  var idSum = copyOfId(filter, idSumOf(filter, index))
  var hashOfIdSum = filter.checkHash(idSum)
  var hashSum = hashSumOf(filter, index)
  if (!equal(hashSum, hashOfIdSum)) {
    return false
  }
  return true
}

// Helpers

function idSumOf (filter, index) {
  var elements = filter.idSumOctets
  var perElement = filter.IdSumView.BYTES_PER_ELEMENT
  var perSum = elements * perElement
  var offset = index * perSum
  return filter.idSums.subarray(offset, offset + perSum)
}

function hashSumOf (filter, index) {
  var elements = filter.hashSumOctets
  var perElement = filter.HashSumView.BYTES_PER_ELEMENT
  var perSum = elements * perElement
  var offset = index * perSum
  return filter.hashSums.subarray(offset, offset + perSum)
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
  idSumOctets: isPositiveInteger,
  hashSumOctets: isPositiveInteger
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
  return (
    Number.isInteger(n) &&
    n > 0
  )
}

function isArrayBuffer (id) {
  return id instanceof ArrayBuffer
}
