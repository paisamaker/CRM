import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, authorize, requireRoles } from '../../middleware/auth.js';
import * as ctrl from './controller.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many auth attempts' } },
});

router.post('/login', authLimiter, ctrl.login);
router.post('/google', authLimiter, ctrl.google);
router.post('/mfa/verify', authLimiter, ctrl.verifyMfa);
router.post('/refresh', ctrl.refresh);
router.post('/forgot', authLimiter, ctrl.forgot);
router.post('/reset', authLimiter, ctrl.reset);
router.post('/invite/accept', ctrl.acceptInvite);

router.use(authenticate);

router.get('/me', ctrl.me);
router.patch('/profile', ctrl.updateProfile);
router.post('/profile/avatar', ...ctrl.uploadAvatar);
router.delete('/profile/avatar', ctrl.deleteAvatar);
router.post('/avatar', ...ctrl.uploadAvatar);
router.delete('/avatar', ctrl.deleteAvatar);
router.post('/logout', ctrl.logout);
router.post('/logout-all', ctrl.logoutAll);
router.get('/sessions', ctrl.sessions);
router.post('/mfa/setup', ctrl.setupMfa);
router.post('/mfa/confirm', ctrl.confirmMfa);
router.post('/mfa/disable', ctrl.disableMfa);
router.post('/change-password', ctrl.changePassword);
router.post('/invite', authorize('users', 'create'), requireRoles('ceo'), ctrl.invite);

export default router;
