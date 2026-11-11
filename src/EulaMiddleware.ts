import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class EulaMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const eulaAccepted = req.headers['eula-accepted'] === 'true';
    if (!eulaAccepted) {
      return res.status(403).json({ message: 'EULA not accepted' });
    }
    next();
  }
}
