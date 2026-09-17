import { Hono } from 'hono'
import { prettyJSON } from 'hono/pretty-json'

const app = new Hono()
app.get('/', (c) => {

  const api = c.req.header('X-API-Key')
  if (!api) {
    return c.json({
      error: 'Missing X-API-Key header',
      status: 'ERROR'
    })
  }
  return c.json({
    status: 'OK',
    message: 'Hello Hono!',
    yourRequestHeaders: {
      userAgent: c.req.header('user-agent'),
      accept: c.req.header('accept'),
      acceptLanguage: c.req.header('accept-language'),
      host: c.req.header('host'),


    }

  })
})

export default app
