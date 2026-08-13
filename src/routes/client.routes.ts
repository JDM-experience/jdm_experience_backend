import { getClient } from '../controllers/client.controller'
import { errorResponseSchema } from '../validators/common.validator'
import { clientIdParamSchema, getClientResponseSchema } from '../validators/client.validator'
import type { RouteDefinition } from './route-definition'

export const clientRoutes: RouteDefinition[] = [
  {
    method: 'get',
    path: '/client/:id',
    handler: getClient,
    summary: 'Get a client by id',
    request: { params: clientIdParamSchema },
    responses: {
      200: { description: 'Client found.', schema: getClientResponseSchema },
      400: { description: 'id was not a positive integer.', schema: errorResponseSchema },
      404: { description: 'No client with that id.', schema: errorResponseSchema },
    },
  },
]
