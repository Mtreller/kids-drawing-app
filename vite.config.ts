import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { houseApiPlugin } from './vite-house-api';

export default defineConfig({
  plugins: [react(), houseApiPlugin()],
  base: '/kids-drawing-app/',
});
