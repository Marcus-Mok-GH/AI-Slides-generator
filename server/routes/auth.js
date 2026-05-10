import { Router } from 'express'
import { DECK_GENERATION_CENTS, getCredits } from '../db.js'

const router = Router()

router.get('/me', async (req, res) => {
  let creditsCents = req.user.creditsCents
  if (typeof creditsCents !== 'number') {
    try {
      creditsCents = await getCredits(req.user.id)
    } catch {
      creditsCents = null
    }
  }

  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      profileImageUrl: req.user.profileImageUrl,
    },
    credits: {
      balanceCents: creditsCents,
      deckCostCents: DECK_GENERATION_CENTS,
    },
  })
})

export default router
