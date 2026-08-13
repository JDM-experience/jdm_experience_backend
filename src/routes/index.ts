import { Router } from 'express'
import clientRoutes from './client.routes'
import healthRoutes from './health.routes'

const router = Router()

router.use(healthRoutes)
router.use(clientRoutes)

export default router
