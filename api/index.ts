import 'dotenv/config'
import app from '../src/app'

// Vercel's Node runtime treats the default export as a (req, res) handler —
// an Express app already has that exact shape, so no adapter is needed here.
// vercel.json rewrites every /api/* request to this one function.
export default app
