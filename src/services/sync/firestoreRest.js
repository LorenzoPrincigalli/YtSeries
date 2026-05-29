function encodeValue(val) {
  if (val === null || val === undefined) return { nullValue: null }
  if (typeof val === 'boolean') return { booleanValue: val }
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) }
    return { doubleValue: val }
  }
  if (typeof val === 'string') return { stringValue: val }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map(encodeValue)
      }
    }
  }
  if (typeof val === 'object') {
    const fields = {}
    for (const [k, v] of Object.entries(val)) {
      fields[k] = encodeValue(v)
    }
    return { mapValue: { fields } }
  }
  return { stringValue: String(val) }
}

function decodeValue(field) {
  if (!field || typeof field !== 'object') return null
  if ('nullValue' in field) return null
  if ('booleanValue' in field) return field.booleanValue
  if ('integerValue' in field) return parseInt(field.integerValue, 10)
  if ('doubleValue' in field) return field.doubleValue
  if ('stringValue' in field) return field.stringValue
  if ('arrayValue' in field) {
    return (field.arrayValue.values || []).map(decodeValue)
  }
  if ('mapValue' in field) {
    const out = {}
    const fields = field.mapValue.fields || {}
    for (const [k, v] of Object.entries(fields)) {
      out[k] = decodeValue(v)
    }
    return out
  }
  return null
}

function decodeDocument(doc) {
  if (!doc?.fields) return null
  const out = {}
  for (const [k, v] of Object.entries(doc.fields)) {
    out[k] = decodeValue(v)
  }
  return out
}

function encodeFields(obj) {
  const fields = {}
  for (const [k, v] of Object.entries(obj)) {
    fields[k] = encodeValue(v)
  }
  return { fields }
}

export { encodeValue, decodeValue, decodeDocument, encodeFields }
