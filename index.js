module.exports = IBF

function IBF ({
  checkHash,
  keyHashes,
  cellCount,
  idSumOctets,
  hashSumOctets,
  arrayBuffer
}) {
  if (!(this instanceof IBF)) {
    return new IBF(arguments[0])
  }

  validateOptions(arguments[0])

  this.checkHash = checkHash
  this.keyHashes = keyHashes

  this.cellCount = cellCount

  const CountView = this.CountView = Int32Array
  const countsBytes = CountView.BYTES_PER_ELEMENT * cellCount

  const IdSumView = this.IdSumView = Uint8Array
  this.idSumOctets = idSumOctets
  const idSumsBytes = (
    IdSumView.BYTES_PER_ELEMENT * idSumOctets * cellCount
  )

  const HashSumView = this.HashSumView = Uint8Array
  this.hashSumOctets = hashSumOctets
  const hashSumsBytes = (
    HashSumView.BYTES_PER_ELEMENT * hashSumOctets * cellCount
  )

  const byteLength = countsBytes + idSumsBytes + hashSumsBytes

  if (arrayBuffer) {
    /* istanbul ignore if */
    if (arrayBuffer.byteLength !== byteLength) {
      throw new Error(
        'Wrong size arrayBuffer. ' +
        'Expected ' + byteLength + ' bytes. ' +
        'Received ' + arrayBuffer.byteLength + ' bytes.'
      )
    }
  } else {
    arrayBuffer = new ArrayBuffer(byteLength)
  }
  this.arrayBuffer = arrayBuffer

  let offset = 0
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
  const checkDigest = filter.checkHash(id)
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
  const counts = filter.counts
  return filter.keyHashes.every(function (hash) {
    return predicate(counts[hash(id)])
  })
}

IBF.prototype.subtract = function (otherIBF) {
  const thisIBF = this
  /* istanbul ignore if */
  if (thisIBF.cellCount !== otherIBF.cellCount) {
    throw new Error('Different cellCount values')
  }
  otherIBF.counts.forEach(function (count, index) {
    const idSum = idSumOf(otherIBF, index)
    const hashSum = hashSumOf(otherIBF, index)
    changeAtIndex(thisIBF, index, idSum, hashSum, -count)
  })
}

function copyOfId (filter, view) {
  const returned = new ArrayBuffer(
    filter.IdSumView.BYTES_PER_ELEMENT * filter.idSumOctets
  )
  new Uint8Array(returned).set(new Uint8Array(view))
  return returned
}

// TODO Throw informative errors instead of returning false.

IBF.prototype.decode = function () {
  const self = this
  const additional = []
  const missing = []

  const cellCount = this.cellCount

  let pureList = findPureCells()
  while (pureList.length !== 0) {
    pureList.forEach(function (pureIndex) {
      /* istanbul ignore if */
      if (!isPure(self, pureIndex)) {
        return
      }
      const id = copyOfId(self, idSumOf(self, pureIndex))
      const count = self.counts[pureIndex]
      if (count === 1) {
        additional.push(id)
        self.remove(id)
      } else {
        missing.push(id)
        self.insert(id)
      }
    })
    pureList = findPureCells()
  }

  function findPureCells () {
    const pures = []
    const length = self.counts.length
    for (let index = 0; index < length; index++) {
      if (isPure(self, index)) {
        pures.push(index)
      }
    }
    return pures
  }

  for (let index = 0; index < cellCount; index++) {
    /* istanbul ignore if */
    if (self.counts[index] !== 0) {
      throw new Error(
        'Could not decode IBF. ' +
        'Count ' + index + ' is ' + self.counts[index] + '.'
      )
    }
    /* istanbul ignore if */
    if (!isZero(idSumOf(self, index))) {
      throw new Error(
        'Could not decode IBF. ' +
        'Cell ' + index + ' idsum ' +
        'is ' + Buffer.from(idSumOf(self, index)).toString('hex') + '.'
      )
    }
    /* istanbul ignore if */
    if (!isZero(hashSumOf(self, index))) {
      throw new Error(
        'Could not decode IBF. ' +
        'Cell ' + index + ' hashSum ' +
        'is ' + Buffer.from(hashSumOf(self, index)).toString('hex') + '.'
      )
    }
  }

  return {
    additional: additional,
    missing: missing
  }
}

function isPure (filter, index) {
  const count = filter.counts[index]
  if (count !== 1 && count !== -1) {
    return false
  }
  const idSum = copyOfId(filter, idSumOf(filter, index))
  const hashOfIdSum = filter.checkHash(idSum)
  const hashSum = hashSumOf(filter, index)
  /* istanbul ignore if */
  if (!equal(hashSum, hashOfIdSum)) {
    return false
  }
  return true
}

// Helpers

function idSumOf (filter, index) {
  const elements = filter.idSumOctets
  const perElement = filter.IdSumView.BYTES_PER_ELEMENT
  const perSum = elements * perElement
  const offset = index * perSum
  return filter.idSums.subarray(offset, offset + perSum)
}

function hashSumOf (filter, index) {
  const elements = filter.hashSumOctets
  const perElement = filter.HashSumView.BYTES_PER_ELEMENT
  const perSum = elements * perElement
  const offset = index * perSum
  return filter.hashSums.subarray(offset, offset + perSum)
}

function isZero (view) {
  return view.every(function (element) {
    return element === 0
  })
}

function xor (view, buffer) {
  const correspondingView = makeCorresponding(view, buffer)
  view.forEach(function (existingElement, index) {
    const correspondingElement = correspondingView[index]
    view[index] = existingElement ^ correspondingElement
  })
}

function equal (view, buffer) {
  const correspondingView = makeCorresponding(view, buffer)
  return view.every(function (element, index) {
    return element === correspondingView[index]
  })
}

function makeCorresponding (view, buffer) {
  const ViewType = view.constructor
  return new ViewType(buffer)
}

// Validation

const optionValidations = {
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
