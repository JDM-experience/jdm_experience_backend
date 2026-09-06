import { Router } from 'express'
import { authRoutes } from './auth.routes'
import { bookingsRoutes } from './bookings.routes'
import { clientRoutes } from './client.routes'
import { contactMessagesRoutes } from './contactMessages.routes'
import { currencyRoutes } from './currency.routes'
import { customersRoutes } from './customers.routes'
import { healthRoutes } from './health.routes'
import { paymentMethodsRoutes } from './paymentMethods.routes'
import { paymentsRoutes } from './payments.routes'
import { reviewsRoutes } from './reviews.routes'
import { type RouteDefinition, withTag } from './route-definition'
import { settingsRoutes } from './settings.routes'
import { toursRoutes } from './tours.routes'
import { uploadsRoutes } from './uploads.routes'
import { usersRoutes } from './users.routes'
import { weatherRoutes } from './weather.routes'

// The single source of truth for every route — both the Express router below
// and the OpenAPI doc (src/docs/openapi.ts) are generated from this array,
// so a new endpoint only needs to be added here once. Each resource is wrapped in withTag() so
// Swagger UI groups its endpoints into one collapsible section instead of one flat list.
export const allRoutes: RouteDefinition[] = [
  ...withTag('Health', healthRoutes),
  ...withTag('Client', clientRoutes),
  ...withTag('Auth', authRoutes),
  ...withTag('Users', usersRoutes),
  ...withTag('Settings', settingsRoutes),
  ...withTag('Contact Messages', contactMessagesRoutes),
  ...withTag('Tours', toursRoutes),
  ...withTag('Uploads', uploadsRoutes),
  ...withTag('Bookings', bookingsRoutes),
  ...withTag('Payments', paymentsRoutes),
  ...withTag('Payment Methods', paymentMethodsRoutes),
  ...withTag('Customers', customersRoutes),
  ...withTag('Reviews', reviewsRoutes),
  ...withTag('Weather', weatherRoutes),
  ...withTag('Currency', currencyRoutes),
]

const router = Router()

for (const route of allRoutes) {
  const handlers = Array.isArray(route.handler) ? route.handler : [route.handler]
  router[route.method](route.path, ...handlers)
}

export default router
