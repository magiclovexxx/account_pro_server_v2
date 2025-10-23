
import express from 'express';
const router = express.Router();


router.post('/auth/register', async (req, res) => {
    res.status(200).json({
            success: false,
        });

})

export default router;