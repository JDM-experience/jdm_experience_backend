import { Router } from 'express'
import { getClient } from '../controllers/client.controller'

const router = Router()

router.get('/client/:id', getClient)

export default router
