import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * 单文件构建:dist/index.html 内联全部 JS/CSS,双击即玩、便于分发
 */
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
});
