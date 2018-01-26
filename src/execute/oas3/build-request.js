// This function runs after the common function,
// `src/execute/index.js#buildRequest`
import assign from 'lodash/assign'
import get from 'lodash/get'
import btoa from 'btoa'

export default function (options, req) {
  const {
    operation,
    requestBody,
    securities,
    spec
  } = options

  let {
    requestContentType
  } = options

  req = applySecurities({request: req, securities, operation, spec})

  const requestBodyDef = operation.requestBody || {}
  const requestBodyMediaTypes = Object.keys(requestBodyDef.content || {})

  // for OAS3: set the Content-Type
  if (requestBody) {
    // does the passed requestContentType appear in the requestBody definition?
    const isExplicitContentTypeValid = requestContentType
      && requestBodyMediaTypes.indexOf(requestContentType) > -1

    if (requestContentType && isExplicitContentTypeValid) {
      req.headers['Content-Type'] = requestContentType
    }
    else if (!requestContentType) {
      const firstMediaType = requestBodyMediaTypes[0]
      if (firstMediaType) {
        req.headers['Content-Type'] = firstMediaType
        requestContentType = firstMediaType
      }
    }
  }

  // for OAS3: add requestBody to request
  if (requestBody) {
    if (requestContentType) {
      if (requestBodyMediaTypes.indexOf(requestContentType) > -1) {
        // only attach body if the requestBody has a definition for the
        // contentType that has been explicitly set
        if (requestContentType === 'application/x-www-form-urlencoded') {
          if (typeof requestBody === 'object') {
            req.form = {}
            Object.keys(requestBody).forEach((k) => {
              const val = requestBody[k]
              let newVal

              if (typeof val === 'object') {
                if (Array.isArray(val)) {
                  newVal = val.toString()
                }
                else {
                  newVal = JSON.stringify(val)
                }
              }
              else {
                newVal = val
              }

              req.form[k] = {
                value: newVal
              }
            })
          }
          else {
            req.form = requestBody
          }
        }
        else {
          req.body = requestBody
        }
      }
    }
    else {
      req.body = requestBody
    }
  }

  return req
}

// Add security values, to operations - that declare their need on them
// Adapted from the Swagger2 implementation
export function applySecurities({request, securities = {}, operation = {}, spec}) {

  const result = assign({}, request)
  const {authorized = {}} = securities
  // this means we loop through the securities as defined in the spec.
  // operation security is the security defined to that path operation
  // or spec.security is the global security.

  // we then check our authorizations AGAINST those specified securities
  // and if those authorizations match the security (name match) then we build out the header/query/etc
  const security = operation.security || spec.security || []
  const isAuthorized = authorized && !!Object.keys(authorized).length
  const securityDef = get(spec, ['components', 'securitySchemes']) || {}

  result.headers = result.headers || {}
  result.query = result.query || {}

  if (!Object.keys(securities).length || !isAuthorized || !security ||
      (Array.isArray(operation.security) && !operation.security.length)) {
    return request
  }
  security.forEach((securityObj, index) => {
    for (const key in securityObj) {
      const auth = authorized[key]
      const schema = securityDef[key]

      if (!auth) {
        continue
      }

      const value = auth.value || auth
      const {type} = schema

      if (auth) {
        if (type === 'apiKey') {
          let name = auth.name || schema.name;
          let inType = auth.in || schema.in;

          if (inType === 'query') {
            result.query[name] = value
          }
          if ((inType === 'header') || (inType === 'headers')) {
            result.headers[name] = value
          }
          if ((inType === 'cookie') || (inType === 'cookies')) {
            result.cookies[name] = value
          }
        }
        else if (type === 'http') {
          if (schema.scheme === 'basic') {
            const {username, password} = value
            const encoded = btoa(`${username}:${password}`)
            result.headers.Authorization = `Basic ${encoded}`
          }

          if (schema.scheme === 'bearer') {
            result.headers.Authorization = `Bearer ${value}`
          }
        }
        else if (type === 'oauth2') {
          const token = auth.token || {}
          const accessToken = token.access_token
          let tokenType = token.token_type

          if (!tokenType || tokenType.toLowerCase() === 'bearer') {
            tokenType = 'Bearer'
          }

          result.headers.Authorization = `${tokenType} ${accessToken}`
        }
      }
    }
  })

  return result
}
