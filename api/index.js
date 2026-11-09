// Función serverless de Vercel: reutiliza la aplicación Express del backend.
// Todas las rutas /api/* se redirigen aquí (ver vercel.json).
import { app } from '../backend/src/app.js';

export default app;
